module.exports.subscribeToDescribe = function (carotte, qualifier, meta) {
    carotte.subscribe(`${qualifier}:describe`, { queue: { durable: false, autoDelete: true }}, () => {
        return meta;
    });
};
