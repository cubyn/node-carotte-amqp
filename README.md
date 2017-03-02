# carotte-amqp

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

**Compatible with**:
  - Auto-documentation of your microservices with [carotte-dashboard](https://github.com/cubyn/carotte-dashboard)
  - A [cli](https://github.com/cubyn/carotte-cli) to easily call your services from the shell
  - A [loader](https://github.com/cubyn/node-carotte-loader) to uniformize your microservices structure

## Sample usage

Only basic usage is covered here, you can browse the [https://github.com/cubyn/node-carotte-amqp/tree/master/examples](examples folder) on the repo for more use-cases.

### Module configuration

Here is a basic sample configuration using default interval values for reference (each one is optional):
```js
const carotte = require('carotte-amqp')({
    serviceName: require('package.json').name, // your service name
    host: 'localhost:5672', // amqp host name
    enableAutodoc: false, // answer to autodocumentation fanout requests
    enableDeadLetter: false, // should failing messages be put in dead-letter?
    deadLetterQualifier: 'direct/dead-letter', // dead-lettered messages will be sent here
    autoDescribe: false // provide a :describe queue for your function
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
    .then(({ data }) => {
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

carotte.parallel('fanout', { firstname: 'Gabe' }, (err, { data }) => {
    if (!err) {
        console.log(data);
    }
});
```

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
    .then(({ data }) => {
        console.log(data.description);
    });
```

This structure is also used in [carotte-dashboard](https://github.com/cubyn/carotte-dashboard) to auto-document your microservices architecture. You can find more information about how it works on the dashboard repository.
