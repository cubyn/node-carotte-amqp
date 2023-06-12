const debug = require('debug');
const Puid = require('puid');
const amqp = require('amqplib');
const clone = require('safe-clone-deep');

const autodocAgent = require('./autodoc-agent');
const describe = require('./describe');
const MessageRegister = require('./message-register');
const carottePackage = require('../package.json');

const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');
const {
    createDeferred,
    execInPromise,
    identity,
    deserializeError,
    serializeError,
    extend,
    emptyTransport,
    getTransactionStack,
    debugDestinationExists,
    getDebugQueueName
} = require('./utils');
const {
    parseQualifier,
    getPackageJson,
    getExchangeName,
    getQueueName,
    parseSubscriptionOptions
} = require('./configs');

const puid = new Puid();
const initDebug = debug('carotte:init');
const consumerDebug = debug('carotte:consumer');
const producerDebug = debug('carotte:producer');

const errorToRetryRegex = /(311|320|405|506|541)/;

const pkg = getPackageJson();

const RPC_QUALIFIER = '';

/**
 * Create a simple wrapper for amqplib with more functionnalities
 * @constructor
 * @param {object} config - Configuration for amqp
 */
function Carotte(config) {
    // assign default config to the use config
    config = Object.assign({
        serviceName: pkg.name,
        host: 'amqp://localhost:5672',
        enableAutodoc: false,
        deadLetterQualifier: 'dead-letter',
        enableDeadLetter: true,
        autoDescribe: false,
        transport: emptyTransport
    }, config);

    // Note: ensure retro compatibility
    if (!(config.host.startsWith('amqp://') || config.host.startsWith('amqps://'))) {
        config.host = `amqp://${config.host}`;
    }

    config.connexion = Object.assign({
        noDelay: true,
        clientProperties: {}
    }, config.connexion);

    config.connexion.clientProperties = Object.assign(config.connexion.clientProperties, {
        'carotte-version': carottePackage.version,
        'carotte-host-name': pkg.name,
        'carotte-host-version': pkg.version
    });

    const carotte = {};

    /** @type {Record<string, Promise<amqp.Replies.AssertExchange>>} */
    let exchangeCache = {};
    const correlationIdCache = {};

    const consumers = [];
    const messageRegister = new MessageRegister();
    let shutdownPromise = null;

    let replyToSubscription;
    /** @type {Promise<amqp.Connection>} */
    let connexion;
    /** @type {Record<string | 0, Promise<amqp.Channel>>} */
    let channels = {};

    carotte.getConnection = function getConnection() {
        if (connexion) {
            return connexion;
        }

        connexion = amqp.connect(config.host, config.connexion).then(conn => {
            conn.on('close', (err) => {
                connexion = undefined;
                channels = {};
                carotte.cleanExchangeCache();
                carotte.onConnectionClose(err);
            });
            conn.once('error', carotte.onError);

            return conn;
        })
        .catch(err => {
            connexion = undefined;
            channels = {};
            carotte.cleanExchangeCache();
            throw err;
        });

        return connexion;
    };

    /**
     * Create or get a channel in cache
     * @param {string} [name] The qualifier name of the channel, if prefetch is 0 this is not used
     * @param {number} [prefetch] The channel prefetch settings
     */
    carotte.getChannel = function getChannel(name = RPC_QUALIFIER, prefetch = 0, isDebug = false) {
        prefetch = Number(prefetch);
        const channelKey = (prefetch > 0) ? `${name}:${prefetch}` : 0;

        if (channels[channelKey]) {
            return channels[channelKey];
        }

        channels[channelKey] = carotte.getConnection()
            .then(conn => conn.createChannel())
            .then(chan => { chan.prefetch(prefetch, (process.env.RABBITMQ_PREFETCH === 'legacy') ? undefined : true); return chan; })
            .then(chan => {
                initDebug(`channel ${channelKey} created correctly`);
                chan.on('close', (err) => {
                    config.transport.info('carotte-amqp: channel closed', { channelKey });

                    channels[channelKey] = undefined;
                    if (channelKey === RPC_QUALIFIER) {
                        replyToSubscription = undefined;
                    }
                    if (!isDebug) {
                        carotte.cleanExchangeCache();
                        carotte.onChannelClose(err);
                    }
                });

                // this allow chan to throw on errors
                chan.once('error', !isDebug ? carotte.onError : () => {});

                if (config.enableDeadLetter && !isDebug) {
                    return chan.assertQueue(config.deadLetterQualifier)
                        .then(q => chan.bindQueue(q.queue, 'amq.direct', q.queue))
                        .then(() => chan);
                }
                return chan;
            })
            .catch(err => {
                channels[channelKey] = undefined;
                if (channelKey === RPC_QUALIFIER) {
                    replyToSubscription = undefined;
                }
                if (!isDebug) {
                    carotte.cleanExchangeCache();
                    throw err;
                }
            });

        return channels[channelKey];
    };

    /**
     * delete all exchange from cache
     */
    carotte.cleanExchangeCache = function cleanExchangeCache() {
        exchangeCache = {};
    };

    /**
     * create a queue for rpc responses
     * @param {object} [options.timeout] return promise will be rejected if timeout ms is expired
     * @return {promise} return a new queue
     */
    carotte.getRpcQueue = function getRpcQueue() {
        if (!replyToSubscription) {
            replyToSubscription = carotte.subscribe(
                RPC_QUALIFIER,
                { queue: { exclusive: true, durable: false } },
                ({ data, headers, context }) => {
                    const isError = headers['x-error'];
                    const correlationId = headers['x-correlation-id'];

                    if (correlationId && correlationIdCache[correlationId]) {
                        consumerDebug(`Found a correlated callback for message: ${correlationId}`);

                        const deferred = correlationIdCache[correlationId];

                        // clear the RPC timeout interval if set
                        clearInterval(deferred.timeoutFunction);

                        // rpc should not touch transaction context props of parent
                        const transactionProperties = {
                            transactionStack: deferred.context.transactionStack,
                            transactionId: deferred.context.transactionId
                        };
                        Object.assign(deferred.context, context, transactionProperties);

                        const returnObject = {
                            headers,
                            data: isError ? deserializeError(data) : data,
                            context: deferred.context
                        };

                        const answer = deferred.options.completeAnswer ?
                            returnObject : returnObject.data;

                        if (isError) {
                            if (deferred.reject) {
                                deferred.reject(answer);
                                delete correlationIdCache[correlationId];
                            } else {
                                deferred.callback(returnObject.data, answer);
                            }
                        } else if (deferred.resolve) {
                            deferred.resolve(answer);
                            delete correlationIdCache[correlationId];
                        } else {
                            deferred.callback(null, answer);
                        }
                    }
                });
        }

        return replyToSubscription;
    };

    /**
     * Invoke a function
     * @param {string} qualifier - A message from the consume method
     * @param {import('.').CarotteAmqp.PublishOptions} [options] - Options for exchange and publish
     * @param {object} [payload] - Data to send to the function
     * @return {promise} return when message is published
     */
    carotte.publish = function publish(qualifier, options, payload = {}) {
        if (arguments.length === 2) {
            payload = options;
            options = {};
        }

        if (qualifier.startsWith('topic/')) {
            const resubQualifier = qualifier.split('/');
            qualifier = `topic/${resubQualifier[resubQualifier.length - 1]}`;
        }

        options = Object.assign({ headers: {}, context: {} }, options, parseQualifier(qualifier));

        if (!config.enableDeadLetter || config.deadLetterQualifier !== qualifier) {
            options.headers['x-destination'] = qualifier;
        }

        // get updated routing key for debug, if dest queue exists
        return debugDestinationExists(carotte, options.routingKey, options.context)
            .then(routingKey => {
                const exchangeName = getExchangeName(options);
                const rpc = options.headers['x-reply-to'] !== undefined;
                const {
                    log = true,
                    persistent = true
                } = options;

                // isContentBuffer is used by internal functions who don't modify the content
                const buffer = options.isContentBuffer
                    ? payload
                    : Buffer.from(JSON.stringify({
                        data: payload,
                        context: Object.assign({}, options.context, {
                            transactionStack: getTransactionStack(options.context)
                        })
                    }));

                producerDebug('called');

                return carotte.getChannel()
                    .then(chan => {
                        /** @type {Promise<amqp.Replies.AssertExchange>} */
                        let ok;

                        if (!exchangeCache[exchangeName]) {
                            producerDebug(`create exchange ${exchangeName}`);
                            ok = chan.assertExchange(exchangeName, options.type, {
                                durable: options.durable
                            });
                            exchangeCache[exchangeName] = ok;
                        } else {
                            producerDebug(`use exchange ${exchangeName} from cache`);
                            ok = exchangeCache[exchangeName];
                        }

                        return ok.then(() => {
                            producerDebug(`publishing to ${options.routingKey} on ${exchangeName}`);
                            if (log) {
                                config.transport.info(`${rpc ? '▶ ' : '▷ '} ${options.type}/${options.routingKey}`, {
                                    context: options.context,
                                    headers: options.headers,
                                    request: getRequestPayload(payload, options),
                                    subscriber: options.context['origin-consumer'] || '',
                                    destination: qualifier
                                });
                            }

                            return chan.publish(
                                exchangeName,
                                routingKey,
                                buffer,
                                {
                                    headers: Object.assign({}, options.headers, {
                                        'x-carotte-version': carottePackage.version,
                                        'x-origin-service': pkg.name
                                    }),
                                    contentType: 'application/json',
                                    persistent
                                }
                            );
                        });
                    })
                    .catch(err => {
                        config.transport.error(`${rpc ? '▶ ' : '▷ '} ${options.type}/${options.routingKey}`, {
                            context: options.context,
                            headers: options.headers,
                            request: payload,
                            subscriber: options.context['origin-consumer'] || '',
                            destination: qualifier,
                            error: err
                        });

                        if (err.message.match(errorToRetryRegex)) {
                            return carotte.publish(qualifier, options, payload);
                        }

                        throw err;
                    });
            });
    };

    /**
     * Invoke a function and expect a result
     * @param {string} qualifier - A message from the consume method
     * @param {object} options - Options given to publish
     * @param {object} payload - Data to send to the function
     * @return {promise} return the function response
     */
    carotte.invoke = function invoke(qualifier, options, payload) {
        if (arguments.length === 2) {
            payload = options;
            options = {};
        }

        const uid = puid.generate();
        const correlationPromise = createDeferred(options.timeout);

        correlationIdCache[uid] = correlationPromise;
        correlationPromise.context = options.context || {};
        correlationPromise.options = options;

        carotte.getRpcQueue().then(q => {
            options.headers = Object.assign({
                'x-reply-to': q.queue,
                'x-correlation-id': uid
            }, options.headers);

            carotte.publish(qualifier, options, payload);
        });

        return correlationPromise.promise;
    };

    carotte.invokeWithFullResponse = function invokeWithFullResponse(qualifier, options, payload) {
        if (payload === undefined) {
            payload = options;
            options = {};
        }

        options.completeAnswer = true;

        return carotte.invoke(qualifier, options, payload);
    };


    /**
     * Launches a request and listen to multiple RPC callbacks. For each answer
     * the callback parameter will be executed
     * @param  {string}   qualifier The destination qualifier
     * @param  {object}   [options]   Message options
     * @param  {object}   [payload]   Message to be delivered
     * @param  {Function} callback  Callback function to be executed for each
     *                              received response: function(err, data);
     * @return {string}             Parallel interval uid to be used with @clearParallel
     */
    carotte.parallel = function parallel(qualifier, options, payload, callback) {
        if (arguments.length === 3) {
            callback = payload;
            payload = options;
            options = {};
        }

        const uid = puid.generate();

        correlationIdCache[uid] = { callback, context: options.context || {}, options };

        carotte.getRpcQueue().then(q => {
            options.headers = Object.assign({
                'x-reply-to': q.queue,
                'x-correlation-id': uid
            }, options.headers);

            return carotte.publish(qualifier, options, payload);
        });

        return uid;
    };

    carotte.parallelWithFullResponse =
        function parallelWithFullResponse(qualifier, options, payload, callback) {
            if (arguments.length === 3) {
                callback = payload;
                payload = options;
                options = {};
            }

            options.completeAnswer = true;

            return carotte.parallel(qualifier, options, payload, callback);
        };

    /**
     * Check if the response must be send back and send the response if needed
     * @param {string} parallelId - The key to remove from cache, see @parallel
     */
    carotte.clearParallel = function clearParallel(parallelId) {
        delete correlationIdCache[parallelId];
    };

    /**
     * Subcribe to a channel with a specific exchange type and consume incoming messages
     * @param {string} qualifier - describe the type and the queue name of the consumer
     * @param {object} options - Options for queue, exchange and consumer
     * @param {object} handler - The callback consume each new messages
     * @param {object} meta - Meta description of the functions
     */
    carotte.subscribe = function subscribe(qualifier, options, handler, meta, logger = undefined) {
        // options is optionnal thus change the params order
        if (typeof options === 'function') {
            meta = handler;
            handler = options;
            options = {};
        }

        // don't use debug queue on fanout exchange types as it has no effect
        // it will likely bork the channel
        if (qualifier !== 'fanout') {
            qualifier = getDebugQueueName(qualifier, options);
        }

        if (meta) {
            autodocAgent.addSubscriber(qualifier, meta);
            if (config.autoDescribe) {
                describe.subscribeToDescribe(this, qualifier, meta);
            }
        }

        options = parseSubscriptionOptions(options, qualifier);

        const transport = options.transport === null
            ? emptyTransport
            : (options.transport || config.transport);
        const exchangeName = getExchangeName(options);
        const queueName = getQueueName(options, config);

        let subscriptionTimeout = null;

        return Promise.race([
            new Promise((_resolve, reject) => {
                subscriptionTimeout = setTimeout(() => {
                    /**
                     * We've seen during some RabbitMQ maintenance that for some queues, the binding
                     * step can hang forever. It seems this happens when RabbitMQ reaches a corrupt
                     * state where the queue is still referenced in its internal database, but
                     * references a node that doesn't exist anymore.
                     *
                     * When that happened, it led to situations where the service was consuming
                     * messages only of some queues. In particular, we faced a situation where the
                     * "listener" queues of a given service were gone, such that some topics were
                     * never processed by the service, creating major data inconsistencies and
                     * leading to one of the worst business days at Cubyn in years.
                     *
                     * It also led to describe queues to not have any consumer, such that gateway
                     * rest wasn't discovering the controllers. It made some endpoints unavailable,
                     * but at least it wasn't creating a false sense that the feature was working.
                     *
                     * We don't know how to reproduce that issue, but we know that solving it was
                     * easy as forcing all pods to restart again (= rollout restart). Enforcing a
                     * timeout on the subscription will effectively create the same behavior,
                     * allowing the service to auto-repair itself.
                     */
                    const error = new Error('carotte subscription timeout');
                    error.qualifier = qualifier;
                    error.options = options;
                    error.meta = meta;

                    reject(error);
                }, options.subscriptionTimeout);
            }),
            // once channel is ready
            carotte.getChannel(qualifier, options.prefetch)
                .then(channel => getQueue(channel)
                    .then(q => bindQueue(channel, q)
                        .then(() => channel.prefetch(options.prefetch))
                        /**
                         * createConsumer calls subPublication with current this
                         * hence the need to call createConsumer with same context
                         */
                        .then(() => channel.consume(q.queue, createConsumer.call(this, channel, q)))
                        .then(consumer => consumers.push({
                            consumerTag: consumer.consumerTag,
                            chan: channel
                        }))
                        .then(() => channel.prefetch(0))
                        .then(identity(q))
                    )
                )
                .catch(error => {
                    config.transport.error('carotte-amqp: failed to subscribe queue', {
                        error,
                        qualifier,
                        options,
                        meta
                    });

                    throw error;
                })
                .finally(() => clearTimeout(subscriptionTimeout))
        ]);


        /**
         * @param {amqp.Channel} channel
         */
        function getQueue(channel) {
            // create the exchange if not existing
            return channel.assertExchange(exchangeName, options.type, {
                durable: options.durable
            })
                // create the queue for this exchange if not existing
                .then(() => channel.assertQueue(queueName, options.queue))
                .then((assertQueue) => {
                    if (qualifier === RPC_QUALIFIER) {
                        config.transport.info('carotte-amqp: subscribed to rpc queue', { queue: assertQueue });
                    }
                    consumerDebug(`queue ${assertQueue.queue} ready.`);
                    return assertQueue;
                });
        }

        /**
         * @param {amqp.Channel} channel
         * @param {amqp.Replies.AssertQueue} assertQueue
         */
        function bindQueue(channel, assertQueue) {
            const bindedWith = options.routingKey || assertQueue.queue;
            return channel.bindQueue(assertQueue.queue, exchangeName, bindedWith)
                .then(() => {
                    if (qualifier.startsWith('topic/')) {
                        const resubQualifier = qualifier.split('/');
                        return channel.bindQueue(assertQueue.queue, exchangeName,
                            `${resubQualifier[resubQualifier.length - 1]}`);
                    }
                    return channel;
                })
                .then(() => {
                    consumerDebug(`${assertQueue.queue} binded on ${exchangeName} with ${bindedWith}`);
                    return assertQueue;
                });
        }

        /**
         * @param {amqp.Channel} channel
         * @param {amqp.Replies.AssertQueue} assertQueue
         */
        function createConsumer(channel, assertQueue) {
            /**
             * @param {amqp.ConsumeMessage | null} message
             */
            return (message) => {
                // https://amqp-node.github.io/amqplib/channel_api.html#channel_consume
                if (message === null) {
                    config.transport.error('carotte-amqp: consumer cancelled by rabbitmq', {
                        subscriber: assertQueue.queue,
                        exchangeName
                    });

                    // we throw an error to trigger a restart of the service
                    throw new Error('carotte consumer cancelled');
                }

                consumerDebug(`message handled on ${exchangeName} by queue ${assertQueue.queue}`);
                messageRegister.start(qualifier);

                const { headers } = message.properties;

                const messageStr = message.content.toString();
                const content = JSON.parse(messageStr);

                const { data, context } = content;
                const startTime = new Date().getTime();
                const rpc = headers['x-reply-to'] !== undefined;

                context['origin-consumer'] = headers['x-origin-consumer'];

                if (context.error) {
                    context.error = deserializeError(context.error);
                }

                if (message.fields.redelivered && !headers['x-ignore-redeliver']) {
                    const redeliveredError = new Error(`Unhandled message: redelivered by RabbitMQ

see doc: https://www.rabbitmq.com/reliability.html#consumer-side`);

                    redeliveredError.messageProperties = message.properties;
                    redeliveredError.messageFields = message.fields;

                    return carotte.handleRetry(
                        qualifier,
                        options,
                        meta,
                        headers,
                        context,
                        message)(redeliveredError)
                        .then(result => {
                            messageRegister.finish(qualifier);
                            return result;
                        }, error => {
                            messageRegister.finish(qualifier);
                            throw error;
                        });
                }

                // execute the handler inside a try catch block
                return execInPromise(handler,
                    {
                        data,
                        headers,
                        context,
                        invoke: subPublication(context, 'invoke', qualifier).bind(this),
                        publish: subPublication(context, 'publish', qualifier).bind(this),
                        parallel: subPublication(context, 'parallel', qualifier).bind(this),
                        logger: logger ? contextifyLogger(context, logger) : undefined
                    })
                    .then(response => {
                        const timeNow = new Date().getTime();
                        autodocAgent.logStats(qualifier,
                            timeNow - startTime,
                            context['origin-consumer'] || headers['x-origin-service']);
                        // send back response if needed
                        return carotte.replyToPublisher(message, response, context)
                            // forward response down the chain
                            .then(() => response);
                    })
                .then(response => {
                    consumerDebug('Handler success');
                    // otherwise internal subscribe (rpc…)
                    if (qualifier) {
                        transport.info(`${rpc ? '◀ ' : '◁ '} ${qualifier}`, {
                            context,
                            headers,
                            response,
                            request: data,
                            subscriber: qualifier,
                            destination: '',
                            executionMs: new Date().getTime() - startTime,
                            deliveryTag: message.fields.deliveryTag
                        });
                    }

                    return channel.ack(message);
                })
                .catch(carotte.handleRetry(qualifier, options, meta,
                    headers, context, message, startTime))
                .then(result => {
                    messageRegister.finish(qualifier);
                    return result;
                }, error => {
                    messageRegister.finish(qualifier);
                    throw error;
                });
            };
        }
    };

    /**
     * Handle the retry when the subscriber handler fail
     * @param {object} qualifier - the qualifier of the subscriber
     * @param {object} options   - the options
     * @param {object} meta      - the meta of the subscriber
     * @param {object} headers   - the headers handled by the subscriber
     * @param {object} context   - the context
     * @param {object} message   - the message to republish
     * @param {number} [startTime] - the time the handler took before throwing (if applicable)
     */
    carotte.handleRetry =
    function handleRetry(
        qualifier,
        options,
        meta = {},
        headers,
        context,
        message,
        startTime = null
    ) {
        return error => {
            const err = (typeof error === 'object')
                ? error
                : new Error(error);

            // we MUST be on the same channel than the subscriber to ack a message
            // otherwise channel is borked =)
            return carotte.getChannel(qualifier, options.prefetch)
            .then(chan => {
                const retry = meta.retry || { max: 5, strategy: 'direct', interval: 0 };

                const currentRetry = (Number(headers['x-retry-count']) || 0) + 1;
                const pubOptions = messageToOptions(qualifier, message);
                const rpc = headers['x-reply-to'] !== undefined;

                config.transport.error(`${rpc ? '◀ ' : '◁ '} ${qualifier}`, {
                    context,
                    headers,
                    subscriber: qualifier,
                    destination: '',
                    request: JSON.parse(message.content).data,
                    executionMs: startTime ? new Date().getTime() - startTime : null,
                    error: err
                });

                // if custom error thrown, we want to forward it to producer
                // and avoid storing it in any dead-letter queue so we return here
                if (err.status) {
                    return carotte.replyToPublisher(message, err, context, true)
                        .then(chan.ack(message));
                }

                if (retry.max > 0 && currentRetry <= retry.max) {
                    consumerDebug(`Handler error: trying again with strategy ${retry.strategy}`);
                    const rePublishOptions = incrementRetryHeaders(pubOptions, retry);
                    const nextCallDelay = computeNextCall(pubOptions.headers);

                    return setTimeout(() => {
                        carotte.publish(qualifier, rePublishOptions, message.content)
                            .then(() => chan.ack(message))
                            .catch(() => chan.nack(message));
                    }, nextCallDelay);
                }

                if (retry && currentRetry > retry.max) {
                    err.status = 500;
                }
                consumerDebug(`Handler error: ${err.message}`);

                // publish the message to the dead-letter queue
                // remove exchange options because we manage this queue ourselves
                return carotte.saveDeadLetterIfNeeded(message, err)
                    .then(() => {
                        message.properties.headers = cleanRetryHeaders(
                            message.properties.headers
                        );
                        return carotte.replyToPublisher(message, err, context, true);
                    })
                .then(() => chan.ack(message))
                .catch(() => chan.nack(message));
            });
        };
    };

    /**
     * Publish the message to the dead letter queue according to the config
     * @param {object} message - amqplib message
     * @return {promise}
     */
    carotte.saveDeadLetterIfNeeded = function saveDeadLetterIfNeeded(message, error) {
        if (config.enableDeadLetter) {
            const headers = message.properties.headers;
            const content = JSON.parse(message.content.toString());
            content.context.error = serializeError(error);

            headers['x-ignore-redeliver'] = true;

            // we use content buffer so we don't have to alter object structure
            // { data: , context: }
            return carotte.publish(config.deadLetterQualifier,
                { headers, isContentBuffer: true }, Buffer.from(JSON.stringify(content)));
        }
        return Promise.resolve();
    };

    /**
     * Check if the response must be send back and send the response if needed
     * @param {object} message - A message from the consume method
     * @param {object} payload - The payload to send eventually
     * @param {boolean} isError - if isError is true the payload is serialized
     * @return {promise}
     */
    carotte.replyToPublisher = function replyToPublisher(
        message, payload = {}, context = {}, isError = false) {
        const { headers } = message.properties;

        if ('x-reply-to' in headers) {
            const correlationId = headers['x-correlation-id'];
            consumerDebug(`reply to ${correlationId} on queue direct/${headers['x-reply-to']}`);
            const newHeaders = { 'x-correlation-id': correlationId };

            // if isError we must add a tag for the subscriber to be able to handle it
            if (isError) {
                // use a specific serializer because error have a lot of non enumerable keys
                payload = serializeError(payload);
                newHeaders['x-error'] = 'true';
            }

            return carotte.publish(`direct/${headers['x-reply-to']}`, {
                headers: newHeaders,
                context,
                log: false
            }, payload);
        }
        return Promise.resolve();
    };

    /**
     * Gracefully shutdown carotte:
     * 1. unsubscribe consumers from all channels
     * 2. await current messages being processed
     * 3. close RMQ connection

     * @param  {Number} timeout
     *         if 0 no timeout when awaiting current messages
     *         (risks of process hanging if consumer won't resolve)
     * @return {Promise<Array<String>, Error>}
     *         if success - returns an array of qualifiers
     *             having been succesfully awaited
     *         if error - rejects MessageWaitTimeoutError
     *             containing messages that have timed out
     */
    carotte.shutdown = function shutdown(timeout = 0) {
        if (shutdownPromise) return shutdownPromise;

        // unsubscribe for any new message
        const unsubscribeChannels = consumers.map(
            consumer => consumer.chan.cancel(consumer.consumerTag)
        );

        let awaitError;
        let awaitedMessages;

        shutdownPromise =
            // unsubscribe from all queues
            Promise.all(unsubscribeChannels)
            // wait for current messages to be acked or nacked
            .then(() => messageRegister.wait(timeout))
            .then((messages) => {
                awaitedMessages = messages;

                // Avoid unhandled message when a new instance get a requeud message
                return new Promise((resolve) => setTimeout(resolve, 2000));
            })
            // in case we could not wait for all messages,
            // we still need to go on closing RMQ connection
            .catch(error => {
                awaitError = error;
            })
            // finally close RMQ TCP connection
            .then(() => connexion)
            .then((c) => {
                if (c) c.close();
            })
            .then(() => {
                if (awaitError) throw awaitError;
                return awaitedMessages;
            });

        return shutdownPromise;
    };

    if (config.enableAutodoc) {
        autodocAgent.ensureAutodocAgent(carotte);
    }

    function logError(message, error) {
        // when close is initiated by .close(), amqplib
        // emits 'close' without any error
        if (error) config.transport.error(`carotte-amqp: ${message}`, { error });

        return error;
    }

    carotte.onError = error => logError('error caught', error);
    carotte.onChannelClose = error => logError('channel closed', error);
    carotte.onConnectionClose = error => logError('connection closed', error);

    return carotte;
}

/**
 * Wrap any carotte publication method (invoke, parallel, publish) to pass context
 * @param  {object} context The current object context
 * @param  {string} method  The name of the carotte method to wrap
 * @return {Promise}        The wrapped method return value
 */
function subPublication(context, method, originQualifier) {
    return function (qualifier, options, ...params) {
        if (!params.length) {
            params.push(options);
            options = {};
        }

        options.headers = Object.assign({}, options.headers, {
            'x-origin-consumer': originQualifier
        });

        options.context = Object.assign(context, options.context);

        return this[method](qualifier, options, ...params);
    };
}

/**
 * Wrap the logger methods (log, info, error, warn) to pass context
 * @param  {object} context The current object context
 * @param  {object} logger  The current, unwrapped object logger
 * @return {object}         The wrapped object logger
 */
function contextifyLogger(context, logger) {
    const wrappedLogger = clone(logger);

    // Should follow the Logger type defined in ./index.d.ts
    // Otherwise, the log message will not be contextualized
    //
    // for (let method in console) {
    //   if (typeof console[method] === 'function') {
    //     ...
    //
    // seems overkill
    ['silly', 'debug', 'verbose', 'info', 'warn', 'error'].forEach((methodName) => {
        const method = wrappedLogger[methodName];

        wrappedLogger[methodName] = function (message, ...meta) {
            // logger.info('ok', { pid: 1 }) becomes:
            // logger.info('ok', { pid: 1, context: { ... } })
            meta[0] = Object.assign({}, meta[0], context);
            method.apply(this, [message, ...meta]);
        };
    });

    return wrappedLogger;
}

/**
 * Convert a message from consume to publish options
 * @param {object} qualifier - The exchange, queue formmatted in a string more info in the README.
 * @param {amqp.Message} message - A message from the consume method
 * @return {object} options formatted for the publish method
 */
function messageToOptions(qualifier, message) {
    return {
        context: getContext(message),
        headers: message.properties.headers,
        exchangeName: message.fields.exchange,
        isContentBuffer: true
    };
}


/**
 * @param {amqp.Message} message - A message from the consume method
 */
function getContext(message) {
    try {
        const { context } = JSON.parse(message.content.toString());

        return context || {};
    } catch (error) {
        return {};
    }
}


function getRequestPayload(payload, options) {
    if (!options.isContentBuffer) {
        return payload;
    }

    try {
        const { data } = JSON.parse(payload.toString());

        if (typeof data === 'undefined') {
            return payload;
        }

        return data;
    } catch (error) {
        return payload;
    }
}

/**
 * Update all 'x-retry' headers
 * @param {object} options - An object options compatible with publish
 * @param {object} retry - Retry object from subscriber metas
 * @return {object} An object headers
 */
function incrementRetryHeaders(options, retry) {
    const newHeaders = {};

    if (!('x-retry-max' in options.headers)) {
        newHeaders['x-retry-max'] = `${retry.max}`;
    }
    if (!('x-retry-strategy' in options.headers)) {
        newHeaders['x-retry-strategy'] = `${retry.strategy}`;
    }
    if (!('x-retry-interval' in options.headers)) {
        newHeaders['x-retry-interval'] = `${retry.interval}`;
    }
    if (!('x-retry-count' in options.headers)) {
        newHeaders['x-retry-count'] = '1';
    } else {
        newHeaders['x-retry-count'] = `${Number(options.headers['x-retry-count']) + 1}`;
    }

    options.headers = Object.assign(options.headers, newHeaders);

    return options;
}

/**
 * Filter unused headers
 * @param {object} headers - An object containing all headers
 * @return {object} An object headers
 */
function cleanRetryHeaders(headers) {
    return extend({}, headers, [
        'x-retry-max',
        'x-retry-count',
        'x-retry-strategy',
        'x-retry-interval'
    ]);
}

/**
 * Compute the delay before the retry with the help of headers
 * @param {object} headers - The headers of the current message
 * @return {number} The delay to wait before the next retry
 */
function computeNextCall(headers) {
    const strategy = headers['x-retry-strategy'];
    const current = Number(headers['x-retry-count']);
    const interval = Number(headers['x-retry-interval'] || 0);

    switch (strategy) {
        case 'exponential': {
            // eslint-disable-next-line no-restricted-properties
            return Math.pow(2, current - 1) * interval;
        }
        case 'direct':
        default: return interval;
    }
}

Carotte.EXCHANGE_TYPE = EXCHANGE_TYPE;
Carotte.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

module.exports = Carotte;
