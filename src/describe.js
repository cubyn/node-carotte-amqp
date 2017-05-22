const replaceNonDirect = /^(topic|fanout)\//;

module.exports.subscribeToDescribe = function (carotte, qualifier, meta) {
    qualifier = qualifier.replace(replaceNonDirect, 'direct/');
    carotte.subscribe(`${qualifier}:describe`, { queue: { durable: false, autoDelete: true } }, () => {
        return meta;
    });
};
