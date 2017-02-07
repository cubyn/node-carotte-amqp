function createDeferred() {
    const deferred = {};

    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    return deferred;
}

function identity(x) {
    return () => x;
}

function execInPromise(func, ...params) {
    return new Promise((resolve, reject) => {
        try {
            return resolve(func(...params));
        } catch (err) {
            return reject(err);
        }
    });
}

module.exports = {
    createDeferred,
    execInPromise,
    identity
};
