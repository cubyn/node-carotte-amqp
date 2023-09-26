const configs = require('./configs');

const replaceNonDirect = /^(topic|fanout)\//;

module.exports.subscribeToDescribe = function (carotte, qualifier, meta) {
    if (replaceNonDirect.test(qualifier)) {
        qualifier = qualifier.replace(replaceNonDirect, 'direct/');
        const parts = qualifier.split('/');
        qualifier = `${parts[0]}/${parts[parts.length - 1]}`;
    }

    // remove debug token from qualifier before subscribing to the describe channel
    // because previous queue is already suffixed with debug token and subscribe will do it
    // again
    if (configs.debugToken) {
        qualifier = qualifier.replace(`:${configs.debugToken}`, '');
    }

    /**
     * Previous :describe queues were set with `durable: false, autoDelete: true` which was causing
     * issues. Since queue properties are immutable, metas are now exposed on :describe:v2 queues.
     */
    carotte.subscribe(`${qualifier}:describe:v2`, () => {
        return meta;
    });
};
