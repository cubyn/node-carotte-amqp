const { extend } = require('../utils');

/**
 * Filter retry headers
 * @template {import('..').CarotteAmqp.PublishOptions['headers']} I
 * @param {I} headers
 * @return {Omit<I, keyof import('..').CarotteAmqp.RetryHeaders>}
 */
function cleanRetryHeaders(headers) {
    return extend({}, headers, [
        'x-retry-max',
        'x-retry-count',
        'x-retry-strategy',
        'x-retry-interval',
        'x-retry-jitter'
    ]);
}

/**
 * Compute the delay before the retry with the help of headers
 * @param {import('..').CarotteAmqp.RetryHeaders} headers - The headers of the current message
 * @return {number} The delay to wait before the next retry
 */
function computeNextCall(headers) {
    const strategy = headers['x-retry-strategy'];
    const current = Number(headers['x-retry-count']);
    const interval = Number(headers['x-retry-interval'] || 0);
    const jitterRange = Number(headers['x-retry-jitter'] || 0);
    const jitter = Math.floor(Math.random() * jitterRange);

    switch (strategy) {
        case 'exponential': {
            // eslint-disable-next-line no-restricted-properties
            return Math.pow(2, current - 1) * interval + jitter;
        }
        case 'direct':
        default: return interval + jitter;
    }
}

/**
 * Update all 'x-retry' headers
 * @param {import('..').CarotteAmqp.PublishOptions} options
 * @param {Required<import('..').CarotteAmqp.SubscribeMeta['retry']>} retry
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
    if (!('x-retry-jitter' in options.headers) && retry.jitter) {
        newHeaders['x-retry-jitter'] = `${retry.jitter}`;
    }
    if (!('x-retry-count' in options.headers)) {
        newHeaders['x-retry-count'] = '1';
    } else {
        newHeaders['x-retry-count'] = `${Number(options.headers['x-retry-count']) + 1}`;
    }

    options.headers = Object.assign(options.headers, newHeaders);

    return options;
}

module.exports = {
    cleanRetryHeaders,
    computeNextCall,
    incrementRetryHeaders
};
