/* eslint-disable max-len */

/**
 * @typedef {Promise<unknown>} Response
 * @typedef {[string, object, object]} InvokeParameters
 * @typedef {[string, object, object]} PublishParameters
 * @typedef {[SubscribeHandlerParameter]} ReceiveParameters
 */

/**
 * @typedef {Object} PluginOptions
 * @property {(next: (...args: InvokeParameters) => Promise<unknown>, ...args: InvokeParameters) => Promise<unknown> | undefined} onInvoke
 * @property {(next: (...args: PublishParameters) => Promise<unknown>, ...args: PublishParameters) => Promise<unknown> | undefined} onPublish
 * @property {(next: (...args: ReceiveParameters) => Promise<unknown>, ...args: ReceiveParameters) => Promise<unknown> | undefined} onReceive
 */

const ALLOWED_HOOKS = ['onInvoke', 'onPublish', 'onReceive'];

/**
 * Build hooks to execute plugins arround the defined handler.
 * For more details about plugins execution, read the tests.
 *
 * @param {PluginOptions[]} plugins Carotte plugins
 */
const getHooks = (plugins = []) => {
    const defaultHooks = ALLOWED_HOOKS.reduce((hooks, hookName) => {
        hooks[hookName] = (next, ...args) => next(...args);

        return hooks;
    }, {});

    const hooks = plugins.reverse().reduce(
        (currentHooks, plugin) => {
            Object.keys(plugin).forEach(hookName => {
                if (ALLOWED_HOOKS.includes(hookName) === false) {
                    // eslint-disable-next-line no-console
                    console.warn(`Invalid carotte plugin hook: '${hookName}'. Ignored`);
                } else {
                    const currentHook = currentHooks[hookName];
                    const pluginHook = plugin[hookName];

                    currentHooks[hookName] = (handler, ...args) => {
                        const next = (...nextArgs) => currentHook(handler, ...nextArgs);
                        return pluginHook(next, ...args);
                    };
                }
            });

            return currentHooks;
        },
        defaultHooks
    );

    Object.keys(hooks).forEach(hookName => {
        const hook = hooks[hookName];
        hooks[hookName] = (handler) => (...args) => hook(handler, ...args);
    });

    return hooks;
};

module.exports = {
    getHooks
};
