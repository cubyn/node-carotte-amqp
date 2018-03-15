const defaults = {
    host: process.env.AMQP_HOST || 'localhost'
};

const builder = require('../src');

module.exports = function (options) {
    return builder(Object.assign({}, defaults, options));
};
