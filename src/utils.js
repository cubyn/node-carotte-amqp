const configs = require('./configs');

function createDeferred(timeout) {
    const deferred = {};

    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    if (timeout) {
        deferred.timeoutFunction = setTimeout(() => {
            deferred.reject(new Error(`${timeout}ms timeout reached`));
        }, timeout);
    }

    return deferred;
}

function noop() {}

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

/**
 * Return queue name for destination (when debug mode enabled).
 * Also able to modify queue options to make them non-durable, auto-delete
 * @param  {string}} queue   The initial queue name
 * @param  {object} [options] Provide amqp options for queue if you are subscribing
 * @param  {string} tokenOverride override the config token with provided string
 * @return {string}         The queue name to use for your call
 */
function getDebugQueueName(queue, options, tokenOverride) {
    if (process.env.NODE_ENV === 'production') return queue;

    // debug token can be extracted from config (env) or context
    const debugToken = tokenOverride || configs.debugToken;

    if (!debugToken) {
        return queue;
    }

    // if caller provides an option, it means he is probably subscribing
    // so in case we set the queue as trashable (erase it on disconnect)
    if (options) {
        options.queue = options.queue || {};
        options.queue.durable = false;
        options.queue.autoDelete = true;
    }

    return `${queue}:${debugToken}`;
}

/**
 * Checks if queue exists in the broker and resolves with destination queue name
 * @param  {object} carotte a carotte instance
 * @param  {string} queue   The initial queue name
 * @param  {object} context The context object
 * @return {string}         The destination queue name
 */
function debugDestinationExists(carotte, queue, context) {
    if (process.env.NODE_ENV === 'production') return Promise.resolve(queue);

    // only if there is a debug token
    const debugToken = context.debugToken || configs.debugToken;

    // and don't bother with RPC answers
    if (debugToken && !queue.startsWith('amq.gen')) {
        // get our trashable channel for existance check
        // because amqp.lib trash the channel with checkQueue :D
        return carotte.getChannel(debugToken, 1, true)
            .then(channel => {
                const dest = getDebugQueueName(queue, undefined, debugToken);
                return channel.checkQueue(dest)
                    .then(() => {
                        // if it pass queue exists, we add token to context for future calls
                        context.debugToken = debugToken;
                        return dest;
                    }).catch(err => queue);
            });
    }

    return Promise.resolve(queue);
}

const emptyTransport = {
    log: noop,
    info: noop,
    // only disable error logs when tests are run
    // eslint-disable-next-line no-console
    error: (!process.env.LOADED_MOCHA_OPTS) ? /* istanbul ignore next */ console.error : noop,
    warn: noop
};

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CHARS_LENGTH = CHARS.length;

function generateStackId() {
    let id = '';

    for (let i = 0; i < 4; i++) {
        id += CHARS.charAt(Math.floor(Math.random() * CHARS_LENGTH));
    }

    return id;
}

function getTransactionStack(context) {
    if (!context.transactionStack) return [generateStackId()];
    return [...context.transactionStack, generateStackId()];
}

module.exports = {
    createDeferred,
    execInPromise,
    identity,
    serializeError,
    deserializeError,
    extend,
    emptyTransport,
    getTransactionStack,
    debugDestinationExists,
    getDebugQueueName
};
