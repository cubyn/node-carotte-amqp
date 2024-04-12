import { Connection, Channel, Options } from 'amqplib';

declare namespace CarotteAmqp {
    interface Logger {
        info: (message: string, ...meta: any[]) => void;
        warn: (message: string, ...meta: any[]) => void;
        error: (message: string, ...meta: any[]) => void;
    }

    type ParallelId = string;
    type ConsumerTag = string;

    type CarotteOptions = {
        serviceName: string;
        host: string;
        autoDescribe: boolean;
        enableAutodoc: boolean;
        enableDeadLetter: boolean;
        deadLetterQualifier: string;
        transport: Logger;
        connexion: {
            noDelay: boolean;
            clientProperties: {
                'carotte-host-name': string;
                'carotte-version': string;
                'carotte-host-version': string;
            };
        };
    };

    type RetryHeaders = {
        'x-retry-max': string;
        'x-retry-strategy': 'direct' | 'exponential' | 'fixed';
        'x-retry-interval'?: string;
        'x-retry-count': string;
    };

    type PublishOptions = Pick<Options.Publish,  'persistent'> & {
        exchangeName?: string;
        context?: object;
        headers?: Options.Publish['headers'] & {
            'x-reply-to'?: string;
        };
        log?: boolean;
        durable?: boolean;
        isContentBuffer?: boolean;
    };

    type SubscribeMeta = {
        description: string;
        permissions?: string[];
        isValidationEnabled?: boolean;
        requestSchema: any;
        responseSchema: any;
        // Retry is a meta in Carotte AMQP. Used as option in Carotte Runtime
        retry?: {
            max?: number;
            interval?: number;
            strategy?: 'direct' | 'exponential' | 'fixed';
        };
    };

    type SubscribeOptions = {
        type?: 'direct' | 'headers' | 'fanout' | 'topic';
        routingKey?: string;
        durable?: boolean;
        queue?: {
            exclusive: boolean;
            durable: boolean;
            autoDelete: boolean;
        };
        exchange?: {
            durable: boolean;
        };
        prefetch?: number;
        /**
         * Override or deactivate the root transport for this subscriber ONLY.
         *
         * undefined means the root transport (from config) will be used
         * null means transport will be deactivated
         * otherwise the value will be used as transport
         */
        transport?: Logger | null;
    };

    type SubscribeHandlerParameter = {
        data: any;
        headers: any;
        context: any;
        publish: any;
        invoke: any;
        parallel: any;
        logger?: Logger;
    };

    type SubscribeHandler = (params: SubscribeHandlerParameter) => Promise<any>;

    interface Transport {
        getConnection: () => Promise<Connection>;

        /**
         * Create or get a channel in cache
         * @param {string} [name] The qualifier name of the channel, if prefetch is 0 this is not used
         * @param {number} [prefetch] The channel prefetch settings
         * @return {promise} return the channel created
         */
        getChannel(name?: string, prefetch?: number, isDebug?: boolean): Promise<Channel & { consumers: Record<ConsumerTag, Function>[] }>;

        /**
         * delete all exchange from cache
         */
        cleanExchangeCache: () => void;

        /**
         * create a queue for rpc responses
         * @param {object} [options.timeout] return promise will be rejected if timeout ms is expired
         * @return {promise} return a new queue
         */
        getRpcQueue(): Promise<any>;

        /**
         * Invoke a function
         * @param {string} qualifier - A message from the consume method
         * @param {object} [options] - Options for exchange and publish
         * @param {object} [payload] - Data to send to the function
         * @return {promise} return when message is published
         */
        publish<Payload = any, Response = any, Options extends PublishOptions = object>(qualifier: string, options: Options, payload: Payload): Promise<Response>;

        /**
         * Invoke a function
         * @param {string} qualifier - A message from the consume method
         * @param {object} [payload] - Data to send to the function
         * @return {promise} return when message is published
         */
        publish<Payload = any, Response = any>(qualifier: string, payload: Payload): Promise<Response>;

        /**
         * Invoke a function and expect a result
         * @param {string} qualifier - A message from the consume method
         * @param {object} options - Options given to publish
         * @param {object} payload - Data to send to the function
         * @return {promise} return the function response
         */
        invoke<Payload = any, Response = any, Options extends PublishOptions = object>(qualifier: string, options: Options, payload: Payload): Promise<Response>;

        /**
         * Invoke a function and expect a result
         * @param {string} qualifier - A message from the consume method
         * @param {object} payload - Data to send to the function
         * @return {promise} return the function response
         */
        invoke<Payload = any, Response = any>(qualifier: string, payload: Payload): Promise<Response>;

        invokeWithFullResponse(qualifier: any, options: any, payload: any): Promise<any>;

        /**
         * Launches a request and listen to multiple RPC callbacks. For each answer
         * the callback parameter will be executed
         * @param  {string}   qualifier The destination qualifier
         * @param  {object}   [options]   Message options
         * @param  {object}   [payload]   Message to be delivered
         * @param  {Function} callback  Callback function to be executed for each
         *                              received response: function(err, data);
         * @return {string}             Parallel interval uid to be used with @clearParallel
         */
        parallel(qualifier: string, options: object, payload: object, callback?: Function, ...args: any[]): string;

        parallelWithFullResponse(qualifier: any, options: any, payload: any, callback: any, ...args: any[]): string;

        /**
         * Check if the response must be send back and send the response if needed
         * @param {string} parallelId - The key to remove from cache, see @parallel
         */
        clearParallel: (parallelId: string) => void;

        /**
         * Subcribe to a channel with a specific exchange type and consume incoming messages
         * @param {string} qualifier - describe the type and the queue name of the consumer
         * @param {object} options - Options for queue, exchange and consumer
         * @param {object} handler - The callback consume each new messages
         * @param {object} meta - Meta description of the functions
         * @return {promise} return a new queue
         */
        subscribe(qualifier: string, options: SubscribeOptions, handler: SubscribeHandler, meta: SubscribeMeta, logger?: any): Promise<any>;

        /**
         * Handle the retry when the subscriber handler fail
         * @param {object} qualifier - the qualifier of the subscriber
         * @param {object} meta      - the meta of the subscriber
         * @param {object} headers   - the headers handled by the subscriber
         * @param {object} message   - the message to republish
         */
        handleRetry(qualifier: object, options: any, meta: object, headers: object, context: any, message: object): (error: any) => Promise<any>;

        /**
         * Publish the message to the dead letter queue according to the config
         * @param {object} message - amqplib message
         * @return {promise}
         */
        saveDeadLetterIfNeeded(message: object, error: any): Promise<any>;

        /**
         * Check if the response must be send back and send the response if needed
         * @param {object} message - A message from the consume method
         * @param {object} payload - The payload to send eventually
         * @param {boolean} isError - if isError is true the payload is serialized
         * @return {promise}
         */
        replyToPublisher(message: object, payload?: object, context?: {}, isError?: boolean): Promise<any>;

        /**
         * Gracefully shutdown carotte:
         * 1. unsubscribe consumers from all channels
         * 2. await current messages being processed
         * 3. close RMQ connection

        * @param  {Number} timeout
        *         if 0 no timeout when awaiting current messages
        *         (risks of process hanging if consumer won't resolve)
        * @return {Promise<Array<String>, Error>}
        *         if success - returns an array of qualifiers
        *             having been succesfully awaited
        *         if error - rejects MessageWaitTimeoutError
        *             containing messages that have timed out
        */
        shutdown(timeout?: number): Promise<string[]>;

        onError: (error: any) => any;

        onChannelClose: (error: any) => any;

        onConnectionClose: (error: any) => any;
    }

    namespace Carotte {
        export { EXCHANGE_TYPE };
        export { EXCHANGES_AVAILABLE };
    }

    const EXCHANGE_TYPE: {
        DIRECT: string;
        HEADERS: string;
        FANOUT: string;
        TOPIC: string;
    };

    const EXCHANGES_AVAILABLE: string[];
}
