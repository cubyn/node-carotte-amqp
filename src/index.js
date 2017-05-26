const debug = require('debug');
const Puid = require('puid');
const amqp = require('amqplib');
const autodocAgent = require('./autodoc-agent');
const describe = require('./describe');
const carottePackage = require('../package');

const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');
const {
    createDeferred,
    execInPromise,
    identity,
    deserializeError,
    serializeError,
    extend,
    emptyTransport
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

/**
 * Create a simple wrapper for amqplib with more functionnalities
 * @constructor
 * @param {object} config - Configuration for amqp
 */
function Carotte(config) {
    // assign default config to the use config
    config = Object.assign({
        serviceName: pkg.name,
        host: 'localhost:5672',
        enableAutodoc: false,
        deadLetterQualifier: 'dead-letter',
        enableDeadLetter: true,
        autoDescribe: false,
        transport: emptyTransport
    }, config);

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

    let exchangeCache = {};
    const correlationIdCache = {};

    let replyToSubscription;
    let connexion;
    let channels = {};

    carotte.getConnection = function getConnection() {
        if (connexion) {
            return connexion;
        }

        connexion = amqp.connect(`amqp://${config.host}`, config.connexion).then(conn => {
            conn.on('close', (err) => {
                connexion = undefined;
                channels = {};
                carotte.cleanExchangeCache();
                carotte.onClose(err);
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
     * @return {promise} return the channel created
     */
    carotte.getChannel = function getChannel(name = '', prefetch = 0) {
        prefetch = Number(prefetch);
        const channelKey = (prefetch > 0) ? `${name}:${prefetch}` : 0;

        if (channels[channelKey]) {
            return channels[channelKey];
        }

        channels[channelKey] = carotte.getConnection()
            .then(conn => conn.createChannel())
            .then(chan => { chan.prefetch(prefetch, (process.env.RABBITMQ_PREFETCH === 'legacy') ? undefined : true); return chan; })
            .then(chan => {
                initDebug('channel created correctly');
                chan.on('close', (err) => {
                    channels[channelKey] = undefined;
                    carotte.cleanExchangeCache();
                    carotte.onClose(err);
                });
                // this allow chan to throw on errors
                chan.once('error', carotte.onError);

                if (config.enableDeadLetter) {
                    return chan.assertQueue(config.deadLetterQualifier)
                        .then(q => chan.bindQueue(q.queue, 'amq.direct', q.queue))
                        .then(() => chan);
                }
                return chan;
            })
            .catch(err => {
                channels[channelKey] = undefined;
                carotte.cleanExchangeCache();
                throw err;
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
            replyToSubscription = carotte.subscribe('', { queue: { exclusive: true, durable: false } }, ({ data, headers, context }) => {
                const isError = headers['x-error'];
                const correlationId = headers['x-correlation-id'];

                if (correlationId && correlationIdCache[correlationId]) {
                    consumerDebug(`Found a correlated callback for message: ${correlationId}`);

                    const deferred = correlationIdCache[correlationId];

                    // clear the RPC timeout interval if set
                    clearInterval(deferred.timeoutFunction);

                    Object.assign(deferred.context, context);

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
     * @param {object} [options] - Options for exchange and publish
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

        const exchangeName = getExchangeName(options);
        const rpc = options.headers['x-reply-to'] !== undefined;
        const { log = true } = options;

        // isContentBuffer is used by internal functions who don't modify the content
        const buffer = options.isContentBuffer
            ? payload
            : Buffer.from(JSON.stringify({ data: payload, context: options.context }));

        producerDebug('called');
        return carotte.getChannel()
            .then(chan => {
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
                            data: payload,
                            subscriber: options.context['origin-consumer'] || '',
                            destination: qualifier
                        });
                    }
                    return chan.publish(
                        exchangeName,
                        options.routingKey,
                        buffer, {
                            headers: Object.assign({}, options.headers, {
                                'x-carotte-version': carottePackage.version,
                                'x-origin-service': carottePackage.name
                            }),
                            contentType: 'application/json'
                        }
                    );
                });
            })
            .catch(err => {
                config.transport.error(`${rpc ? '▶ ' : '▷ '} ${options.type}/${options.routingKey}`, {
                    context: options.context,
                    headers: options.headers,
                    data: payload,
                    subscriber: options.context['origin-consumer'] || '',
                    destination: qualifier,
                    error: err
                });

                if (err.message.match(errorToRetryRegex)) {
                    return carotte.publish(qualifier, options, payload);
                }

                throw err;
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
     * @return {promise} return a new queue
     */
    carotte.subscribe = function subscribe(qualifier, options, handler, meta) {
        let chan;

        // options is optionnal thus change the params order
        if (typeof options === 'function') {
            meta = handler;
            handler = options;
            options = {};
        }

        if (meta) {
            autodocAgent.addSubscriber(qualifier, meta);
            if (config.autoDescribe) {
                describe.subscribeToDescribe(this, qualifier, meta);
            }
        }

        options = parseSubscriptionOptions(options, qualifier);

        const exchangeName = getExchangeName(options);
        const queueName = getQueueName(options, config);

        // once channel is ready
        return carotte.getChannel(qualifier, options.prefetch)
            .then(ch => (chan = ch))
            // create the exchange.
            .then(ch => chan.assertExchange(exchangeName, options.type, {
                durable: options.durable
            }))
            // create the queue for this exchange.
            .then(() => chan.assertQueue(queueName, options.queue))
            .then(q => {
                consumerDebug(`queue ${q.queue} ready.`);
                // bind the newly created queue to the chan

                const bindedWith = options.routingKey || q.queue;
                return chan.bindQueue(q.queue, exchangeName, bindedWith)
                .then(() => {
                    if (qualifier.startsWith('topic/')) {
                        const resubQualifier = qualifier.split('/');
                        return chan.bindQueue(q.queue, exchangeName,
                            `${resubQualifier[resubQualifier.length - 1]}`);
                    }
                    return chan;
                })
                .then(() => {
                    consumerDebug(`${q.queue} binded on ${exchangeName} with ${bindedWith}`);

                    return chan.prefetch(options.prefetch)
                    .then(() => chan.consume(q.queue, message => {
                        consumerDebug(`message handled on ${exchangeName} by queue ${q.queue}`);
                        const { headers } = message.properties;

                        const messageStr = message.content.toString();
                        const content = JSON.parse(messageStr);

                        const { data, context } = content;
                        const startTime = new Date().getTime();
                        const rpc = headers['x-reply-to'] !== undefined;

                        headers['x-origin-consumer'] = qualifier;
                        context['origin-consumer'] = qualifier;

                        // execute the handler inside a try catch block
                        return execInPromise(handler,
                            {
                                data,
                                headers,
                                context,
                                invoke: subPublication(context, 'invoke').bind(this),
                                publish: subPublication(context, 'publish').bind(this),
                                parallel: subPublication(context, 'parallel').bind(this)
                            })
                            .then(res => {
                                const timeNow = new Date().getTime();
                                autodocAgent.logStats(qualifier, timeNow - startTime, headers['x-origin-service']);
                                // send back response if needed
                                return carotte.replyToPublisher(message, res, context);
                            })
                        .then(() => {
                            consumerDebug('Handler success');
                            // otherwise internal subscribe (rpc…)
                            if (qualifier) {
                                config.transport.info(`${rpc ? '◀ ' : '◁ '} ${qualifier}`, {
                                    context,
                                    headers,
                                    data,
                                    subscriber: qualifier,
                                    destination: '',
                                    executionMs: new Date().getTime() - startTime,
                                    deliveryTag: message.fields.deliveryTag
                                });
                            }

                            return chan.ack(message);
                        })
                        .catch(carotte.handleRetry(qualifier, options, meta,
                            headers, context, message).bind(this));
                    }))
                    .then(() => chan.prefetch(0))
                    .then(identity(q));
                });
            });
    };

    /**
     * Handle the retry when the subscriber handler fail
     * @param {object} qualifier - the qualifier of the subscriber
     * @param {object} meta      - the meta of the subscriber
     * @param {object} headers   - the headers handled by the subscriber
     * @param {object} message   - the message to republish
     */
    carotte.handleRetry =
    function handleRetry(qualifier, options, meta = {}, headers, context, message) {
        return err => {
            return carotte.getChannel(qualifier, options.prefetch)
            .then(chan => {
                const retry = meta.retry || { max: 5, strategy: 'exponential', interval: 1 };

                const currentRetry = (Number(headers['x-retry-count']) || 0) + 1;
                const pubOptions = messageToOptions(qualifier, message);
                const rpc = headers['x-reply-to'] !== undefined;

                config.transport.error(`${rpc ? '◀ ' : '◁ '} ${qualifier}`, {
                    context,
                    headers,
                    subscriber: qualifier,
                    destination: '',
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
                    const nextCallDelay = computeNextCall(pubOptions);

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
                return carotte.saveDeadLetterIfNeeded(message)
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
    carotte.saveDeadLetterIfNeeded = function saveDeadLetterIfNeeded(message) {
        if (config.enableDeadLetter) {
            return carotte.publish(config.deadLetterQualifier,
                { headers: message.properties.headers, isContentBuffer: true },
                message.content);
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

    if (config.enableAutodoc) {
        autodocAgent.ensureAutodocAgent(carotte);
    }

    function logError(err) {
        config.transport.error(err);
        return err;
    }

    carotte.onError = logError;
    carotte.onClose = logError;

    return carotte;
}

/**
 * Wrap any carotte publication method (invoke, parallel, publish) to pass context
 * @param  {object} context The current object context
 * @param  {string} method  The name of the carotte method to wrap
 * @return {Promise}        The wrapped method return value
 */
function subPublication(context, method) {
    return function (qualifier, options, ...params) {
        if (!params.length) {
            params.push(options);
            options = {};
        }

        options.context = Object.assign(context, options.context);

        return this[method](qualifier, options, ...params);
    };
}

/**
 * Convert a message from consume to publish options
 * @param {object} qualifier - The exchange, queue formmatted in a string more info in the README.
 * @param {object} message - A message from the consume method
 * @return {object} options formatted for the publish method
 */
function messageToOptions(qualifier, message) {
    return {
        headers: message.properties.headers,
        exchangeName: message.fields.exchange,
        isContentBuffer: true
    };
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
    const interval = Number(headers['x-retry-interval']);

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
