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

/**
 * Get service informations, with all stored subscribers with their associated meta and data
 * @return {object} Object containing service data and maintainers/subscribers
 */
function getAll() {
    return {
        name: serviceName,
        hostname: process.env.HOSTNAME || 'local',
        maintainers,
        subscribers
    };
}

/**
 * Add a subscriber to the subscriber pool, and init its stats
 * @param {string} qualifier the carotte qualifier (see doc)
 * @param {object} subscriber subscriber metas
 * @param {object.requestSchema} requestSchema JSONSchema for subscriber input parameters
 * @param {object.responseSchema} responseSchema JSONSchema for subscriber response
 * @param {object.version} [version] the subscriber version code
 */
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

/**
 * Returns a previously stored subscriber (see @addSubscriber)
 * @param  {string} qualifier carotte qualifier
 * @return {object}           A subscriber meta object
 */
function getSubscriber(qualifier) {
    return subscribers[qualifier];
}

/**
 * Register an usage stat into the service description
 * @param  {string} qualifier The carotte qualifier (see doc)
 * @param  {number} duration  The subscriber function processing time
 * @param  {string} caller    The caller service name
 * @return {void}
 */
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

        if (subscriber.performances.duration.min > duration
            || subscriber.performances.duration.min === 0) {
            subscriber.performances.duration.min = duration;
        }

        if (subscriber.performances.duration.max < duration) {
            subscriber.performances.duration.max = duration;
        }

        subscriber.performances.duration.sum += duration;
    }
}

/**
 * Enable the bouillon agent and register the listener fanout queue
 * It will answer to all fanout messages using the responseHandler defined in this file
 * @param  {object} carotte A carotte instance
 * @return {Promise}        Resolves when bouillon listening queue is correctly registered
 */
function ensureBouillonAgent(carotte) {
    // create a fanout subscriber to receive bouillon requests
    return carotte.subscribe('fanout', {
        exchangeName: 'bouillon.fanout',
        queue: { durable: false, exclusive: true }
    }, ({ data }) => {
        const serviceData = responseHandler[data.origin][data.type]();
        const response = JSON.parse(JSON.stringify(serviceData));

        // reset all stats until next broadcast
        for (const subscriber in serviceData.subscribers) {
            addSubscriber(subscriber, serviceData.subscribers[subscriber]);
        }

        return response;
    });
}

module.exports = {
    addSubscriber,
    getSubscriber,
    logStats,
    ensureBouillonAgent
};
