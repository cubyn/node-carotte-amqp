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


function extend(dest, src, filter) {
    if (!filter) filter = [];

    Object.keys(src).forEach(key => {
        if (!filter.includes(key)) {
            dest[key] = src[key];
        }
    });

    return dest;
}

function deserializeError(inputError) {
    // nothing to deserialize
    if (inputError instanceof Error) {
        return inputError;
    }

    // find object to build on
    let errorObject;
    if (!(inputError instanceof Object)) {
        try {
            errorObject = JSON.parse(inputError);
        } catch (parseError) {
            return new Error(`${inputError}`);
        }
    } else {
        errorObject = inputError;
    }

    // wether we should create an error or not
    let error;
    if (errorObject.message) {
        error = new Error(errorObject.message);
    } else {
        error = {};
    }

    // assign all public props
    return extend(error, errorObject);
}

function serializeError(err) {
    var extractedError = {};

    // properties of err can be non enumerable
    Object.getOwnPropertyNames(err).forEach(key => {
        extractedError[key] = err[key];
    });

    return extend(extractedError, err);
}

module.exports = {
    createDeferred,
    execInPromise,
    identity,
    serializeError,
    deserializeError,
    extend
};
