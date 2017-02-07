'use strict';

const { join } = require('path');
const debug = require('debug');
const puid = new (require('puid'));
const amqp = require('amqplib');


const initDebug = debug('carotte:init');
const consumerDebug = debug('carotte:consumer');
const producerDebug = debug('carotte:producer');

const EXCHANGE_TYPE = {
    DIRECT: 'direct',
    HEADERS: 'headers',
    FANOUT: 'fanout',
    TOPIC: 'topic'
};

const EXCHANGES_AVAILABLE = [
    EXCHANGE_TYPE.DIRECT,
    EXCHANGE_TYPE.HEADERS,
    EXCHANGE_TYPE.FANOUT,
    EXCHANGE_TYPE.TOPIC
];

const pkg = getPackageJson();

var exports = module.exports = function Carotte(config) {
    config = Object.assign({
        serviceName: pkg.name
    }, config);

    const carotte = {};

    const connexion = amqp.connect(`amqp://${config.host}`);

    const channelPromise = connexion.then(conn => conn.createChannel());

    const exchangeCache = {};

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
                    producerDebug(`create exchange ${exchangeName}`)
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

        options.rpc = true;

        return new Promise((resolve, reject) => {
            this.subscribe('', {
                queue: { durable: false }
            }, ({ data }) => {
                console.log(data);
                resolve(data);
            }, {})
            .then(q => {
                const queueName = q.queue;
                options.headers = {
                    'x-reply-to': queueName
                };
                this.publish(qualifier, options, data);
            });
        })

    };

    carotte.subscribe = function subscribe(qualifier, options, handler, metas) {
        // options is optionnal thus change the params order
        if (arguments.length <= 3) {
            metas = handler;
            handler = options;
            options = {};
        }

        console.log(handler)

        metas = metas || {};

        options = Object.assign({
            routingKey: '',
            durable: true,
            queue: {},
            exchange: {}
        }, options, parseQualifier(qualifier));

        options.queue = Object.assign({
            exclusive: false
        });

        const exchangeName = getExchangeName(options);

        // once channel is ready
        return channelPromise
            .then(channel => {
                const queueName = getQueueName(options, config);

                // create the exchange.
                return channel.assertExchange(exchangeName, options.type, {
                        durable: options.exchange.durable
                    })
                    .then(() => {
                        // create the queue for this exchange.
                        return channel.assertQueue(queueName, {
                            exclusive: options.queue.exclusive
                        });
                    })
                    .then(q => {
                        consumerDebug(`queue ${q.queue} ready.`)
                        // bind the newly created queue to the channel
                        channel.bindQueue(q.queue, exchangeName, options.routingKey || q.queue);
                        consumerDebug(`${q.queue} binded on ${exchangeName} with ${options.routingKey}`);

                        return channel.consume(q.queue, message => {
                            const content = JSON.parse(message.content.toString());

                            consumerDebug(`message handled on ${exchangeName} by queue ${q.queue}`);
                            try {
                                Promise.resolve(handler({ data: content.data })).then(res => {
                                    if (message.properties.headers['x-reply-to']) {
                                        consumerDebug(`reply to ${message.properties.headers['x-reply-to']}`);
                                        return this.publish(`direct/${message.properties.headers['x-reply-to']}`, res);
                                    }
                                })

                                consumerDebug('message handled correctly');
                                channel.ack(message);
                            } catch (err) {
                                consumerDebug('message handled badly');
                                channel.nack(message);
                            }
                        })
                        .then(() => q);
                    });
            });
    };

    return carotte;
};

exports.EXCHANGE_TYPE = EXCHANGE_TYPE;
exports.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

function parseQualifier(qualifier) {
    const [
        type,
        routingKey,
        queueName
    ] = qualifier.split('/');

    return {
        queueName: queueName || '',
        routingKey: routingKey || '',
        type: type || EXCHANGE_TYPE.DIRECT
    }
}

function getPackageJson() {
    try {
        return require(join(process.env.PWD, 'package.json'));
    } catch (err) {
        return {};
    }
}

function getExchangeName(options) {
    if (options.exchangeName) {
        return options.exchangeName;
    }

    if (!!options.type && EXCHANGES_AVAILABLE.includes(options.type)) {
        return `amq.${options.type}`;
    }

    return '';
}

function getQueueName(options, config) {
    if (options.type === EXCHANGE_TYPE.DIRECT) {
        return options.routingKey;
    }
    if (config.serviceName) {
        return `${config.serviceName}:${options.queueName}`;
    }
    if (options.serviceName) {
        return `${options.serviceName}:${options.queueName}`;
    }
}
