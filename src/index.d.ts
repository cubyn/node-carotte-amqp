import { Connection } from 'amqplib';

// declare module 'carotte-amqp' {
  type Exchange = string;
  type Qualifier = string;
  type ParallelId = string;

  type ServiceName = string;
  type ServiceVersion = number;

  type CarotteLibConfig = {
    serviceName: ServiceName;
    host: string;
    enableAutodoc: boolean;
    enableDeadLetter: boolean;
    autoDescribe: boolean;
    deadLetterQualifier: string;
    transport: any;
    connexion: {
      noDelay: boolean;
      clientProperties: {
        'carotte-host-name': ServiceName;
        'carotte-version': ServiceVersion;
        'carotte-host-version': ServiceVersion;
      };
    };
  };
  type Handler = {
    data: any;
    headers: {
      'x-error': string;
      'x-correlation-id': string;
    };
    context: any;
  };
  type SubscribeOptions = {
    queue: {
      exclusive: boolean;
      durable: boolean;
    };
  };

  export declare type CarotteAmqpLibInstance = {
    config: CarotteLibConfig;
    consumers: { consumerTag: string, chan: any }[];
    channels: Record<string, Connection>;
    exchangeCache: Record<string, Exchange>
    onError: () => any;
    onChannelClose: () => any;
    onConnectionClose: () => any;
    getConnection: () => Promise<Connection>;
    getChannel: (name: string, prefetch: number, isDebug: boolean) => Promise<Connection>;
    cleanExchangeCache: () => void;
    clearParallel: (parallelId: ParallelId) => void;
    invokeWithFullResponse: (qualifier: Qualifier, options: any, payload: any) => Promise<void>;
    subscribe: (qualifier: Qualifier, options: SubscribeOptions, handler: Handler, meta: any) => Promise<any>;
    parallel: (qualifier: Qualifier, options: any, payload: any, callback: Function) => Promise<ParallelId>;
    publish: (qualifier: Qualifier, options: any, payload: any) => Promise<void>;
    invoke: (qualifier: Qualifier, options: any, payload: any) => Promise<void>;
    shutdown: (timeout: number) => Promise<string[]>;
  };

  export function Carotte(config: CarotteLibConfig): CarotteAmqpLibInstance;
// }
