const carotte = require('../src')({
    host: 'localhost',
    enableAutodoc: true,
    enableDeadLetter: true
});

let breakk = 0;

carotte.subscribe('topic/my.routing.key.a/my-service1.my.routing.key.a', ({ data }) => {
    console.log(1);
    throw new Error('error');
}, {
    schema: {},
    retry: {
        max: 5,
        interval: 0,
        strategy: 'fixed'
    },
    permissions: []
});

carotte.subscribe('topic/my.routing.key.a/my-service2.my.routing.key.a', ({ data }) => {
    console.log(2);
}, {
    schema: {},
    retry: {
        max: 5,
        interval: 0,
        strategy: 'fixed'
    },
    permissions: []
});

setTimeout(() => {
    carotte.publish('topic/my.routing.key.a', {});
}, 1000);

process.on('unhandledRejection', (err) => {});
