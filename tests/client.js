const defaults = {
    host: process.env.AMQP_HOST || 'localhost'
};

const builder = require('../src');

/**
 * @param {builder.CarotteAmqp.CarotteOptions} [options]
 * @returns {builder.CarotteAmqp.Transport}
 */
module.exports = function (options) {
    return builder(Object.assign({}, defaults, options));
};
