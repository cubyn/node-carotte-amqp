const carotte = require('../src')({
    host: 'localhost'
});

let breakk = 0;

carotte.subscribe('direct/my.routing.key.a', ({ data }) => {
    // return new Promise(resolve => setTimeout(() => resolve(data), 10000));
    // if (breakk < 5) {
        // breakk++;
        throw new Error('ok');
    // }
    // return data;
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
