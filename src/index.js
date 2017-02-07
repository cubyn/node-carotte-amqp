'use strict';

const { join } = require('path');
const debug = require('debug');
const puid = new (require('puid'));
const amqp = require('amqplib');

const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');
const { createDeferred, execInPromise, identity } = require('./utils');
const {
    parseQualifier,
    getPackageJson,
    getExchangeName,
    getQueueName
} = require('./configs');

const initDebug = debug('carotte:init');
const consumerDebug = debug('carotte:consumer');
const producerDebug = debug('carotte:producer');

const pkg = getPackageJson();

var exports = module.exports = function Carotte(config) {
    config = Object.assign({
        serviceName: pkg.name
    }, config);

    const carotte = {};

    const connexion = amqp.connect(`amqp://${config.host}`);

    const channelPromise = connexion.then(conn => conn.createChannel());

    const exchangeCache = {};
    let replyToSubscription;
    const correlationIdCache = {};

    carotte.publish = function publish(qualifier, options, data) {
        if (arguments.length === 2) {
            data = options;
            options = {};
        }

        options = Object.assign({
            headers: {}
        }, options, parseQualifier(qualifier));

        const exchangeName = getExchangeName(options);

        return channelPromise
            .then(channel => {
                let ok;

                if (!exchangeCache[exchangeName]) {
                    producerDebug(`create exchange ${exchangeName}`);
                    ok = channel.assertExchange(exchangeName, options.type, { durable: options.durable });
                    exchangeCache[exchangeName] = ok;
                } else {
                    ok = exchangeCache[exchangeName];
                }

                const buffer = Buffer.from(JSON.stringify({ data }));

                return ok
                    .then(() => {
                        producerDebug(`publishing to ${options.routingKey} on ${exchangeName}`);
                        channel.publish(
                            exchangeName,
                            options.routingKey,
                            buffer,
                            {
                                headers: options.headers,
                                contentType: 'application/json'
                            }
                        )
                    });
            });
    };

    carotte.invoke = function invoke(qualifier, options, data) {
        if (arguments.length === 2) {
            data = options;
            options = {};
        }

        const uid = puid.generate();
        const correlationPromise = correlationIdCache[uid] = createDeferred();

        if (!replyToSubscription) {
            replyToSubscription = this.subscribe('', {}, ({ data, headers }) => {
                const correlationId = headers['x-correlation-id'];

                if (correlationId && correlationIdCache[correlationId]) {
                    consumerDebug(`Found a correlated callback for message: ${correlationId}`);
                    correlationIdCache[correlationId].resolve(data);
                }
            }, {});
        }

        replyToSubscription.then(q => {
            options.headers = ({
                'x-reply-to': q.queue,
                'x-correlation-id': uid
            }, option.headers);

            this.publish(qualifier, options, data);
        });

        return correlationPromise.promise;
    };

    carotte.subscribe = function subscribe(qualifier, options, handler, metas) {
        let channel;

        // options is optionnal thus change the params order
        if (arguments.length <= 3) {
            metas = handler;
            handler = options;
            options = {};
        }

        metas = metas || {};

        options = parseSubscriptionOptions(options, qualifier);

        const exchangeName = getExchangeName(options);
        const queueName = getQueueName(options, config);

        // once channel is ready
        return channelPromise
            .then(ch => {
                channel = ch;

                // create the exchange.
                return channel.assertExchange(exchangeName, options.type, {
                        durable: options.exchange.durable
                    });
            })
            .then(() => {
                // create the queue for this exchange.
                return channel.assertQueue(queueName, {
                    exclusive: options.queue.exclusive,
                    durable: options.queue.durable
                });
            })
            .then(q => {
                consumerDebug(`queue ${q.queue} ready.`);
                // bind the newly created queue to the channel
                channel.bindQueue(q.queue, exchangeName, options.routingKey || q.queue);
                consumerDebug(`${q.queue} binded on ${exchangeName} with ${options.routingKey || q.queue}`);

                return channel.consume(q.queue, message => {
                    const content = JSON.parse(message.content.toString());

                    consumerDebug(`message handled on ${exchangeName} by queue ${q.queue}`);

                    return execInPromise(handler, {
                            data: content.data,
                            headers: message.properties.headers
                        })
                        .then(res => {
                            const replyTo = message.properties.headers['x-reply-to'];
                            const correlationId = message.properties.headers['x-correlation-id'];

                            // send back response if needed
                            if (replyTo) {
                                consumerDebug(`reply to ${correlationId} on queue ${replyTo}`);
                                return this.publish(`direct/${replyTo}`, {
                                    headers: {
                                        'x-correlation-id': correlationId
                                    }
                                }, res);
                            }
                        })
                        .then(() => {
                            consumerDebug('Handler: success');
                            channel.ack(message);
                        })
                        .catch(err => {
                            consumerDebug('Handler: Error');
                            channel.nack(message);
                        });
                })
                .then(identity(q));
            });
    };

    return carotte;
};

exports.EXCHANGE_TYPE = EXCHANGE_TYPE;
exports.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

function parseSubscriptionOptions(options, qualifier) {
    options = Object.assign({
        routingKey: '',
        durable: true,
        queue: {},
        exchange: {}
    }, options, parseQualifier(qualifier));

    options.exchange = Object.assign({
        exclusive: false,
        durable: true
    });

    options.exchange = Object.assign({
        durable: true
    });
    return options;
}
