const config = require('./configs');

const serviceName = config.getPackageJson().name;
const maintainers = config.getPackageJson().maintainers;
const EPOCH = new Date(0);

const responseHandler = {
    master: {
        all: getAll
    }
};

const subscribers = {};

function getAll() {
    return {
        name: serviceName,
        hostname: process.env.HOSTNAME || 'local',
        maintainers,
        subscribers
    };
}

function addSubscriber(qualifier, subscriber) {
    subscriber.performances = {
        duration: {
            min: 0,
            max: 0,
            sum: 0
        }
    };

    subscriber.callers = [];

    subscriber.lastReceivedAt = EPOCH;
    subscriber.firstReceivedAt = EPOCH;

    subscriber.receivedCount = 0;

    subscriber.qualifier = qualifier;

    subscribers[qualifier] = subscriber;
}

function logStats(qualifier, duration, caller) {
    const subscriber = subscribers[qualifier];
    if (subscriber) {
        if (subscriber.receivedCount === 0) {
            subscriber.firstReceivedAt = new Date();
        }

        subscriber.lastReceivedAt = new Date();
        subscriber.receivedCount++;

        if (!subscriber.callers.includes(caller)) {
            subscriber.callers.push(caller);
        }

        if (subscriber.performances.duration.min > duration) {
            subscriber.performances.duration.min = duration;
        }

        if (subscriber.performances.duration.max < duration) {
            subscriber.performances.duration.max = duration;
        }

        subscriber.performances.duration.sum += duration;
    }
}

function ensureBouillonAgent(carotte) {
    return carotte.subscribe('fanout', {
        exchangeName: 'bouillon.fanout',
        queue: { durable: false, exclusive: true }
    }, ({ data }) => {
        if (data) {
            return responseHandler[data.origin][data.type]();
        }
        return false;
    });
}

module.exports = {
    addSubscriber,
    logStats,
    ensureBouillonAgent
};
