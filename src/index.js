const debug = require('debug');
const Puid = require('puid');
const amqp = require('amqplib');
const carottePackage = require('../package');

const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');
const { createDeferred, execInPromise, identity } = require('./utils');
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

function Carotte(config) {
    config = Object.assign({
        serviceName: pkg.name,
        host: 'localhost:5672'
    }, config);

    const carotte = {};

    const connexion = amqp.connect(`amqp://${config.host}`);
    const exchangeCache = {};
    const correlationIdCache = {};

    let replyToSubscription;
    let channel;

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

    carotte.cleanExchangeCache = function cleanExchangeCache() {
        Object.keys(exchangeCache).forEach(key => (exchangeCache[key] = undefined));
    };

    carotte.publish = function publish(qualifier, options, data) {
        if (arguments.length === 2) {
            data = options;
            options = {};
        }

        options = Object.assign({
            headers: {}
        }, options, parseQualifier(qualifier));

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
                    producerDebug(`$use exchange ${exchangeName} from cache`);
                    ok = exchangeCache[exchangeName];
                }

                return ok.then(() => {
                    const buffer = Buffer.from(JSON.stringify({ data }));

                    producerDebug(`publishing to ${options.routingKey} on ${exchangeName}`);
                    return chan.publish(
                        exchangeName,
                        options.routingKey,
                        buffer, {
                            headers: options.headers,
                            contentType: 'application/json'
                        }
                    );
                });
            }).catch(err => {
                if (err.message.match(errorToRetryRegex)) {
                    this.publish(qualifier, options, data);
                }
                throw err;
            });
    };

    carotte.invoke = function invoke(qualifier, options, payload) {
        if (arguments.length === 2) {
            payload = options;
            options = {};
        }

        const uid = puid.generate();
        const correlationPromise = createDeferred();

        correlationIdCache[uid] = correlationPromise;

        if (!replyToSubscription) {
            replyToSubscription = this.subscribe('', { queue: { exclusive: true } }, ({ data, headers }) => {
                const correlationId = headers['x-correlation-id'];

                if (correlationId && correlationIdCache[correlationId]) {
                    consumerDebug(`Found a correlated callback for message: ${correlationId}`);
                    correlationIdCache[correlationId].resolve({ data });
                }
            });
        }

        replyToSubscription.then(q => {
            options.headers = Object.assign({
                'x-reply-to': q.queue,
                'x-correlation-id': uid,
                'x-current-version': carottePackage
            }, options.headers);

            this.publish(qualifier, options, payload);
        });

        return correlationPromise.promise;
    };

    carotte.subscribe = function subscribe(qualifier, options, handler, metas) {
        let chan;

        // options is optionnal thus change the params order
        if (typeof options === 'function') {
            metas = handler;
            handler = options;
            options = {};
        }

        metas = metas || {};

        options = parseSubscriptionOptions(options, qualifier);

        const exchangeName = getExchangeName(options);
        const queueName = getQueueName(options, config);

        // once channel is ready
        return this.getChannel()
            .then(ch => {
                chan = ch;

                // create the exchange.
                return chan.assertExchange(exchangeName, options.type, {
                    durable: options.exchange.durable
                });
            })
            .then(() => {
                // create the queue for this exchange.
                return chan.assertQueue(queueName, options.queue);
            })
            .then(q => {
                consumerDebug(`queue ${q.queue} ready.`);
                // bind the newly created queue to the chan
                chan.bindQueue(q.queue, exchangeName, options.routingKey || q.queue);
                consumerDebug(`${q.queue} binded on ${exchangeName} with ${options.routingKey || q.queue}`);

                return chan.consume(q.queue, message => {
                    const content = JSON.parse(message.content.toString());

                    consumerDebug(`message handled on ${exchangeName} by queue ${q.queue}`);

                    return execInPromise(handler, {
                        data: content.data,
                        headers: message.properties.headers
                    })
                    .then(res => {
                        const replyTo = message.properties.headers['x-reply-to'];
                        const correlationId = message.properties.headers['x-correlation-id'];

                        if (!replyTo) {
                            return undefined;
                        }

                        // send back response if needed
                        consumerDebug(`reply to ${correlationId} on queue ${replyTo}`);
                        return this.publish(`direct/${replyTo}`, {
                            headers: {
                                'x-correlation-id': correlationId
                            }
                        }, res);
                    })
                    .then(() => {
                        consumerDebug('Handler: success');
                        chan.ack(message);
                    })
                    .catch(err => {
                        consumerDebug('Handler: Error');
                        chan.nack(message);
                    });
                })
                .then(identity(q));
            });
    };

    return carotte;
}

Carotte.EXCHANGE_TYPE = EXCHANGE_TYPE;
Carotte.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

module.exports = Carotte;
