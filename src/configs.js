const { join } = require('path');
const { EXCHANGE_TYPE, EXCHANGES_AVAILABLE } = require('./constants');

function parseQualifier(qualifier) {
    let [
        type,
        routingKey,
        queueName
    ] = qualifier.split('/');

    if (type !== 'fanout' && routingKey === undefined) {
        routingKey = type;
        type = EXCHANGE_TYPE.DIRECT;
    } else if (type === 'fanout' && queueName === undefined) {
        queueName = routingKey;
        routingKey = '';
    }

    return {
        queueName: queueName || '',
        routingKey: routingKey || '',
        type: type || EXCHANGE_TYPE.DIRECT
    };
}

function getPackageJson() {
    try {
        // eslint-disable-next-line
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
        return options.routingKey || '';
    }
    if (config.serviceName && options.queueName) {
        return `${config.serviceName}:${options.queueName}`;
    }

    return '';
}

function parseSubscriptionOptions(options, qualifier) {
    options = Object.assign({
        routingKey: '',
        durable: true,
        queue: {},
        exchange: {}
    }, options, parseQualifier(qualifier));

    options.queue = Object.assign({
        exclusive: false,
        durable: true
    }, options.queue);

    options.exchange = Object.assign({
        durable: true
    }, options.exchange);

    return options;
}

module.exports = {
    parseQualifier,
    parseSubscriptionOptions,
    getPackageJson,
    getExchangeName,
    getQueueName
};
