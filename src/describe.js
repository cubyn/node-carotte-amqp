const replaceNonDirect = /^(topic|fanout)\//;

module.exports.subscribeToDescribe = function (carotte, qualifier, meta) {
    if (replaceNonDirect.test(qualifier)) {
        qualifier = qualifier.replace(replaceNonDirect, 'direct/');
        const parts = qualifier.split('/');
        qualifier = `${parts[0]}/${parts[parts.length - 1]}`;
    }

    carotte.subscribe(`${qualifier}:describe`, { queue: { durable: false, autoDelete: true } }, () => {
        return meta;
    });
};
