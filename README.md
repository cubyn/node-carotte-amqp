# carotte-amqp

[![CircleCI](https://circleci.com/gh/cubyn/node-carotte-amqp.svg?style=svg)](https://circleci.com/gh/cubyn/node-carotte-amqp)

[![npm version](https://badge.fury.io/js/carotte-amqp.svg)](https://badge.fury.io/js/carotte-amqp)

```
npm install carotte-amqp
```

A tiny [amqp.node](https://github.com/squaremo/amqp.node) wrapper to be used when you don't want to deal with the low-level RabbitMQ handling.

It is part of a lightweight microservice framework that we are cooking here at Cubyn. carotte-amqp requires **node.js >= 6**

**Features**:
  - Built-in RPC (single and multiple answers)
  - Automatic backoff/retry and dead-letter handling
  - Compatible with direct/topic/fanout exchanges
  - Can aggregate statistics about your queues
  - Tiny (depends on amqplib, debug, and puid)
  - Built-in [distributed tracing](http://microservices.io/patterns/observability/distributed-tracing.html), see doc
  - Provide your own transport to log every microservice message
  - Allow to share your environments and services between developers without launching the whole stack

## Sample usage

Only basic usage is covered here, you can browse the [examples folder](https://github.com/cubyn/node-carotte-amqp/tree/master/examples) on the repo for more use-cases.

### Module configuration

Here is a basic sample configuration using default interval values for reference (each one is optional):
```js
const carotte = require('carotte-amqp')({
    serviceName: require('package.json').name, // your service name
    host: 'amqp://localhost:5672', // amqp host name
    enableAutodoc: false, // answer to autodocumentation fanout requests
    enableDeadLetter: false, // should failing messages be put in dead-letter?
    deadLetterQualifier: 'direct/dead-letter', // dead-lettered messages will be sent here
    autoDescribe: false // provide a :describe queue for your function
});

// SSL connection
// amqplib example: https://github.com/squaremo/amqp.node/blob/main/examples/ssl.js#L37-L44
const carotte = require('carotte-amqp')({
    // ...
    host: 'amqps://localhost:5672',
    connexion: {
        cert: fs.readFileSync('../etc/client/cert.pem'),
        key: fs.readFileSync('../etc/client/key.pem'),
        // cert and key or
        // pfx: fs.readFileSync('../etc/client/keycert.p12'),
        passphrase: 'MySecretPassword',
        ca: [fs.readFileSync('../etc/testca/cacert.pem')]
    }
});
```

### Direct exchange

**Without consumer answer (`publish`)**

This is the most basic usage of AMQP, a publisher emit a message in the broker and there is (at least) one consumer to consume it:

```js
carotte.subscribe('direct/hello.world', ({ data }) => {
    console.log(`hello ${data.firstname}`);
});

carotte.publish('direct/hello.world', { firstname: 'Gabe' });
```

**With consumer answer (`invoke`)**

The lib provides you a way to wait for an answer with the `invoke` method:
```js
carotte.subscribe('direct/hello.world', ({ data }) => {
    return `hello ${data.firstname}`;
});

carotte.invoke('direct/hello.world', { firstname: 'Gabe' })
    .then(data => {
        console.log(data);
    });
```

### Topic
Topic allows RabbitMQ to route a message to *multiple* consumers:
```js
carotte.subscribe('topic/hello.*/function1', ({ data }) => {
    console.log(`function 1 got it!`);
});

carotte.subscribe('topic/hello.world/function2', ({ data }) => {
    console.log(`function 2 got it!`);
});

carotte.publish('topic/hello.world', { firstname: 'Gabe' });
```

### Fanout
Fanout will broadcast a message on all consumers:
```js
carotte.subscribe('fanout/a', ({ data }) => {
    console.log(`function 1 got it!`);
});

carotte.subscribe('fanout/b', ({ data }) => {
    console.log(`function 2 got it!`);
});

carotte.publish('fanout', { firstname: 'Gabe' });
```

### Handling multiple answers (`topic/fanout` with RPC)

This is done using the `parallel` function:
```js
carotte.subscribe('fanout/a', ({ data }) => {
    return `function 1 answer`;
});

carotte.subscribe('fanout/b', ({ data }) => {
    return `function 2 answer`;
});

carotte.parallel('fanout', { firstname: 'Gabe' }, (err, data) => {
    if (!err) {
        console.log(data);
    }
});
```

## Custom transport
To log every incoming and outgoing message, as well as execution time, you can provide your own custom transport to carotte-amqp
```js
const winston = require('winston');
const carotte = require('carotte-amqp')({
    transport: winston
})
```

## Distributed tracing
Propagating a context is easy with carotte-amqp, the lib will take care of it for you.
```js
carotte.subscribe('direct/second-route', ({ data, context }) => {
    console.log(context.requestId); // prints the requestId
    context.count++;
});

carotte.subscribe('direct/first-route', ({ data, context, invoke }) => {
    context.requestId = randomString(10).toString('hex');
    context.count = 0;
    return invoke('direct/second-route', {});
});


carotte.invokeWithFullResponse('direct/first-route', {})

    .then(({ data, context }) => {
        console.log(context.requestId); // prints the request ID
        console.log(context.count); // prints 1
    });
```

The context will be logged in every log of the wrapper, if you provide a custom transport.


## Automatic description
In your microservice architecture, you sometimes want to implement automatic discovery and get a service check for one of your functions or get some metrics of a service. This is done using the `meta` parameter in your `subscribe` functions:

```js
const carotte = require('carotte-amqp')({ autoDescribe: true });

carotte.subscribe('direct/increment', ({ data } => {
    return data + 1;
}), {
    description: 'awesome function that increments',
    version: 1,
    requestSchema: {
        // JSON SCHEMA HERE
    },
    responseSchema: {
        // JSON SCHEMA HERE
    }
});

carotte.invoke('direct/increment:describe')
    .then(data => {
        console.log(data.description);
    });
```

This structure is also used in [carotte-dashboard](https://github.com/cubyn/carotte-dashboard) to auto-document your microservices architecture. You can find more information about how it works on the dashboard repository.

## Automatic Retry
You can set a retry strategy to automatically catch exceptions and execute remote executions again. This is done using the `meta` parameter in your `subscribe` functions.

| property | type   | required | description |
| -------- | ------ | -------- | ----------- |
| max      | int    | y        | maximum number of attempt |
| interval | int    | n        | interval between attempts (depends on strategy) |
| strategy | string | n        | either `direct`, `fixed` or `exponential` |
| jitter   | int    | n        | maximum random delay to add between attempts |

If you don't set any (no presence of `retry` property in `meta`), the default one will be taken into account:
- max: 5
- strategy: 'direct'
- interval: 0
- jitter: 0

```js
const carotte = require('carotte-amqp')({});

carotte.subscribe(
    'direct/increment',
    ({ data } => data + 1),
    {
        retry: {
            max: 2,
            strategy: 'exponential',
            interval: 5,
            jitter: 10
        }
    }
);
```


## Working together
When multiple devs are working on multiple microservices, you can use environment variables to be able to communicate with each other. To do so, the developers must set the `CAROTTE_DEBUG_TOKEN` env variable to a shared string before launching their services.

carotte will then automatically reach each-others services.

## Typing

The typing file was generated by `tsconfig.json`. It should not longer be used because the types are not exactly correct (the library is too complex to have a correct typing).
If the public API changes, directly update the `index.d.ts` file.
