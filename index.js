'use strict';

const { join } = require('path');
const debug = require('debug');
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

var exports = module.exports = function Carotte(config) {
    const carotte = {};

    const pkg = getPackageJson();

    const connexion = amqp.connect(`amqp://${config.host}`);

    const channel = connexion.then(conn => conn.createChannel());


    carotte.publish = function publish(qualifier, options, data) {
        if (arguments.length === 2) {
            data = options;
        }

        options = Object.assign({

        }, options, getType(qualifier));

        if (!options.type) {
            options.type = EXCHANGE_TYPE.DIRECT;
        }

        const exchangeName = getExchangeName(options);

        return channel
            .then(channel => {
                channel.assertExchange(exchangeName, options.type, { durable: options.durable });
                const buffer = Buffer.from(JSON.stringify({ data }));
                channel.publish(exchangeName, options.routingKey, buffer);
            });
    };

    carotte.invoke = function invoke(qualifier, options, data) {

    };

    carotte.subscribe = function subscribe(qualifier, options, handler, metas) {
        // options is optionnal thus change the params order
        if (arguments.length === 3) {
            metas = handler;
            handler = options;
        }

        metas = metas || {};

        options = Object.assign({
            routingKey: '',
            durable: true,
            queue: {},
            exchange: {}
        }, options, getType(qualifier));

        options.queue = Object.assign({
            exclusive: false
        });

        const exchangeName = getExchangeName(options);

        // once channel is ready
        return channel
            .then(channel => {
                let queueName;

                // create the exchange.
                channel.assertExchange(exchangeName, options.type, {
                    durable: options.exchange.durable
                });

                if (options.type === EXCHANGE_TYPE.DIRECT) {
                    queueName = options.routingKey;
                } else {
                    if (config.serviceName) {
                        queueName = `${config.serviceName}:${options.queueName}`;
                    } else if (options.serviceName) {
                        queueName = `${options.serviceName}:${options.queueName}`;
                    } else {
                        queueName = `${pkg.name}:${options.queueName}`;
                    }
                }

                const queueName = getQueueName(options, )

                // create the queue for this exchange.
                return channel.assertQueue(queueName, {
                        exclusive: options.queue.exclusive
                    })
                    .then(q => {
                        // bind the newly created queue to the channel
                        channel.bindQueue(q.queue, exchangeName, options.routingKey);

                        consumerDebug('queue ready to listen incomming messages');

                        return channel.consume(q.queue, message => {
                            const content = JSON.parse(message.content.toString());
                            consumerDebug('message handled');
                            try {
                                const res = handler({
                                    data: content.data
                                });

                                consumerDebug('message handled correctly');
                                channel.ack(message);
                            } catch (err) {
                                consumerDebug('message handled badly');
                                channel.nack(message);
                            }
                        });
                    });
            });
    };

    return carotte;
};

exports.EXCHANGE_TYPE = EXCHANGE_TYPE;
exports.EXCHANGES_AVAILABLE = EXCHANGES_AVAILABLE;

function getType(qualifier) {
    const [
        type,
        routingKey,
        queueName
    ] = qualifier.split('/');

    return {
        queueName,
        routingKey,
        type
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
