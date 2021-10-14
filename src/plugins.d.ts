export type Response = Promise<unknown>;
export type InvokeParameters = [string, object, object];
export type PublishParameters = [string, object, object];
export type ReceiveParameters = [any];
export type PluginOptions = {
    /**
     * (next: (...args: InvokeParameters) => Response, ...args: InvokeParameters) => Response | undefined
     * } onInvoke
     */
    "": any;
};
/**
 * Build hooks to execute plugins arround the defined handler.
 * For more details about plugins execution, read the tests.
 *
 * @param {PluginOptions[]} plugins Carotte plugins
 */
export function getHooks(plugins?: PluginOptions[]): {};
