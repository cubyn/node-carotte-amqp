const carotte = require('../src')({
    host: 'localhost'
});

let breakk = 0;

carotte.subscribe('direct/my.routing.key.b', ({ data, context, headers }) => {
    console.log('B', headers, context, data);
}, {
    schema: {},
    retry: {
        max: 5,
        interval: 0,
        strategy: 'fixed'
    },
    permissions: []
});

carotte.subscribe('direct/my.routing.key.a', ({ data, context, headers, invoke }) => {
    console.log('A', headers, context, data);
    return invoke('direct/my.routing.key.b', data);
}, {
    schema: {},
    retry: {
        max: 5,
        interval: 0,
        strategy: 'fixed'
    },
    permissions: []
});

process.on('unhandledRejection', (err) => console.log(err.stack));
