const debug = require('debug');
const Puid = require('puid');
const amqp = require('amqplib');
const bouillonAgent = require('./bouillon-agent');
const describe = require('./describe');
const carottePackage = require('../package');

const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');
const {
    createDeferred,
    execInPromise,
    identity,
    deserializeError,
    serializeError,
    extend
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
const connexionsDebug = debug('carotte:connexions');
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
        enableBouillon: false,
        deadLetter: 'dead-letter',
        enableDeadLetter: false,
        autoDescribe: false
    }, config);

    const carotte = {};

    const connexion = amqp.connect(`amqp://${config.host}`);
    const exchangeCache = {};
    const correlationIdCache = {};

    let replyToSubscription;
    let channel;

    /**
     * Create or get a channel in cache
     * @return {promise} return the channel created
     */
    carotte.getChannel = function getChannel() {
        if (channel) {
            return Promise.resolve(channel);
        }

        channel = connexion
            .then(conn => conn.createChannel())
            .then(chan => {
                initDebug('channel created correctly');
                channel = chan;
                chan.on('close', (err) => {
                    connexionsDebug('channel closed trying to reopen');
                    this.cleanExchangeCache();
                    channel = null;
                });
                // this allow chan to throw on errors
                chan.once('error', () => {});
                return chan;
            });

        return channel;
    };

    /**
     * delete all exchange from cache
     */
    carotte.cleanExchangeCache = function cleanExchangeCache() {
        Object.keys(exchangeCache).forEach(key => (exchangeCache[key] = undefined));
    };

    /**
     * create a queue for rpc responses
     * @param {object} [options.timeout] return promise will be rejected if timeout ms is expired
     * @return {promise} return a new queue
     */
    carotte.getRpcQueue = function getRpcQueue() {
        if (!replyToSubscription) {
            replyToSubscription = this.subscribe('', { queue: { exclusive: true } }, ({ data, headers }) => {
                const isError = headers['x-error'];
                const correlationId = headers['x-correlation-id'];

                if (correlationId && correlationIdCache[correlationId]) {
                    consumerDebug(`Found a correlated callback for message: ${correlationId}`);

                    const deferred = correlationIdCache[correlationId];

                    // clear the RPC timeout interval if set
                    clearInterval(deferred.timeoutFunction);

                    // TODO manage parallel
                    if (isError) {
                        deferred.reject({ data: deserializeError(data), headers });
                        delete correlationIdCache[correlationId];
                    } else if (deferred.resolve) {
                        deferred.resolve({ data, headers });
                        delete correlationIdCache[correlationId];
                    } else {
                        deferred({ data, headers });
                    }
                }
            });
        }

        return replyToSubscription;
    };

    /**
     * Invoke a function
     * @param {string} qualifier - A message from the consume method
     * @param {object} options - (optionnal) Options for exchange and publish
     * @param {object} payload - Data to send to the function
     * @return {promise} return when message is published
     */
    carotte.publish = function publish(qualifier, options, payload) {
        if (arguments.length === 2) {
            payload = options;
            options = {};
        }

        options = Object.assign({ headers: {} }, options, parseQualifier(qualifier));

        const exchangeName = getExchangeName(options);

        producerDebug('called');
        return this.getChannel()
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

                // isContentBuffer is used by internal functions who don't modify the content
                const buffer = options.isContentBuffer
                    ? payload
                    : Buffer.from(JSON.stringify({ data: payload, context: options.context }));

                return ok.then(() => {
                    producerDebug(`publishing to ${options.routingKey} on ${exchangeName}`);
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
                if (err.message.match(errorToRetryRegex)) {
                    return this.publish(qualifier, options, payload);
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

        this.getRpcQueue().then(q => {
            options.headers = Object.assign({
                'x-reply-to': q.queue,
                'x-correlation-id': uid
            }, options.headers);

            this.publish(qualifier, options, payload);
        });

        return correlationPromise.promise;
    };

    /**
     * TODO
     */
    carotte.parallel = function parallel(qualifier, options, payload, callback) {
        if (arguments.length === 3) {
            callback = payload;
            payload = options;
            options = {};
        }

        const uid = puid.generate();
        correlationIdCache[uid] = callback;

        this.getRpcQueue().then(q => {
            options.headers = Object.assign({
                'x-reply-to': q.queue,
                'x-correlation-id': uid
            }, options.headers);

            return this.publish(qualifier, options, payload);
        });

        return uid;
    };

    /**
     * Check if the response must be send back and send the response if needed
     * @param {string} parallelId - The key to remove from cache
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
            bouillonAgent.addSubscriber(qualifier, meta);
            if (config.autoDescribe) {
                describe.subscribeToDescribe(this, qualifier, meta);
            }
        } else {
            meta = { timer: {} };
        }

        meta.timer = Object.assign({
            delay: 0,
            max: 0,
            strategy: 'fixed'
        }, meta.timer);

        options = parseSubscriptionOptions(options, qualifier);

        const exchangeName = getExchangeName(options);
        const queueName = getQueueName(options, config);

        // once channel is ready
        return this.getChannel()
            .then(ch => (chan = ch))
            // create the exchange.
            .then(ch => chan.assertExchange(exchangeName, options.type, options.exchange))
            // create the queue for this exchange.
            .then(() => chan.assertQueue(queueName, options.queue))
            .then(q => {
                consumerDebug(`queue ${q.queue} ready.`);
                // bind the newly created queue to the chan

                const bindedWith = options.routingKey || q.queue;
                return chan.bindQueue(q.queue, exchangeName, bindedWith)
                .then(() => {
                    consumerDebug(`${q.queue} binded on ${exchangeName} with ${bindedWith}`);

                    return chan.consume(q.queue, message => {
                        consumerDebug(`message handled on ${exchangeName} by queue ${q.queue}`);
                        const { headers } = message.properties;
                        const content = JSON.parse(message.content.toString());
                        const { data, context } = content;
                        const startTime = new Date().getTime();

                        // execute the handler inside a try catch block
                        return execInPromise(handler, { data, headers, context })
                            .then(res => {
                                const timeNow = new Date().getTime();
                                bouillonAgent.logStats(qualifier, timeNow - startTime, headers['x-origin-service']);
                                // send back response if needed
                                return this.replyToPublisher(message, res);
                            })
                        .then(() => {
                            consumerDebug('Handler success');
                            return chan.ack(message);
                        })
                        .catch(err => {
                            const retry = meta.retry || { max: Infinity };
                            const currentRetry = (Number(headers['x-retry-count']) || 0) + 1;

                            const pubOptions = messageToOptions(qualifier, message);

                            if (retry && retry.max > 0 && currentRetry <= retry.max) {
                                consumerDebug(`Handler error: trying again with strategy ${retry.strategy}`);
                                const rePublishOptions = incrementRetryHeaders(pubOptions, retry);
                                const nextCallDelay = computeNextCall(pubOptions);

                                setTimeout(() => {
                                    this.publish(qualifier, rePublishOptions, message.content)
                                        .then(() => chan.ack(message));
                                }, nextCallDelay);
                            } else {
                                consumerDebug(`Handler error: ${err.message}`);
                                delete pubOptions.exchange;

                                // publish the message to the dead-letter queue
                                this.saveDeadLetterIfNeeded(pubOptions, message.content)
                                    .then(() => {
                                        message.properties.headers = cleanRetryHeaders(
                                                message.properties.headers
                                                );
                                        return this.replyToPublisher(message, err, true);
                                    })
                                .then(() => chan.ack(message));
                            }
                        });
                    })
                    .then(identity(q));
                });
            });
    };

    /**
     * Publish the message to the dead letter queue according to the config
     * @param {object} options - options to publish
     * @param {object} content - content for dead letter
     * @return {promise}
     */
    carotte.saveDeadLetterIfNeeded = function saveDeadLetterIfNeeded(options, content) {
        if (config.enableDeadLetter) {
            return this.publish(config.deadLetter, options, content);
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
    carotte.replyToPublisher = function replyToPublisher(message, payload = {}, isError = false) {
        const { headers } = message.properties;

        if ('x-reply-to' in headers) {
            const correlationId = headers['x-correlation-id'];
            consumerDebug(`reply to ${correlationId} on queue ${headers['x-correlation-id']}`);
            const newHeaders = { 'x-correlation-id': correlationId };

            // if isError we must add a tag for the subscriber to be able to handle it
            if (isError) {
                // use a specific serializer because error have a lot of non enumerable keys
                payload = serializeError(payload);
                newHeaders['x-error'] = 'true';
            }

            return this.publish(`direct/${headers['x-reply-to']}`, {
                headers: newHeaders
            }, payload);
        }
        return Promise.resolve();
    };

    if (config.enableBouillon) {
        bouillonAgent.ensureBouillonAgent(carotte);
    }

    return carotte;
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
            return Math.exp(current - 1) * interval;
        }
        case 'direct':
        default: return interval;
    }
}

Carotte.EXCHANGE_TYPE = EXCHANGE_TYPE;
Carotte.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

module.exports = Carotte;
