import { Connection, Channel } from 'amqplib';

declare namespace CarotteAmqp {
  type Exchange = string;
  export type Qualifier = string;
  type ParallelId = string;
  type ConsumerTag = string;

  // amqplib types only provide methods (not properties)
  type AmqpLibChannel = Channel & { consumers: Record<ConsumerTag, Function>[] };

  export type ServiceName = string;
  export type ServiceVersion = number;

  type CarotteLibOptions = {
    serviceName: ServiceName;
    host: string;
    enableAutodoc: boolean;
    enableDeadLetter: boolean;
    autoDescribe: boolean;
    deadLetterQualifier: Qualifier;
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

  export type HandlerParams = {
    data: any;
    headers: {
      'x-error': string;
      'x-correlation-id': string;
    };
    context: any;
  };

  export type HandlerFunction = (params: HandlerParams) => Promise<any>;

  // Too hard to exactly describe the possible properties
  export type SubscribeOptions = {
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
    retry?: {
      max: number;
      intervale: number;
      strategy: 'direct' | 'exponential' | 'fixed';
    };
  };

  export type SubscribeMeta = {
    description: string;
    requestSchema: any;
    responseSchema: any;
  };

  export type LibInstance = {
    config: CarotteLibOptions;
    consumers: { consumerTag: string, chan: any }[];
    channels: Record<string, AmqpLibChannel>;
    exchangeCache: Record<string, Exchange>
    onError: () => any;
    onChannelClose: () => any;
    onConnectionClose: () => any;
    getConnection: () => Promise<Connection>;
    getChannel: (name?: string, prefetch?: number, isDebug?: boolean) => Promise<AmqpLibChannel>;
    cleanExchangeCache: () => void;
    clearParallel: (parallelId: ParallelId) => void;
    invokeWithFullResponse: (qualifier: Qualifier, options: any, payload: any) => Promise<void>;
    // Arguments shift
    subscribe: (qualifier: Qualifier, options: SubscribeOptions | HandlerFunction, handler?: HandlerFunction | SubscribeMeta, meta?: SubscribeMeta) => Promise<any>;
    parallel: (qualifier: Qualifier, options: any, payload: any, callback: Function) => Promise<ParallelId>;
    publish: (qualifier: Qualifier, options: any, payload: any) => Promise<void>;
    // Arguments shift
    invoke: (qualifier: Qualifier, options: any, payload?: any) => Promise<void>;
    shutdown: (timeout: number) => Promise<string[]>;
  };

  export function Carotte(config: CarotteLibOptions): LibInstance;
}
