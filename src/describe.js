module.exports.subscribeToDescribe = function (carotte, qualifier, meta) {
    carotte.subscribe(`${qualifier}:describe`, () => {
        return meta;
    });
};
