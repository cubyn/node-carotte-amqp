const carotte = require('../src')();
const bench = require('./tools');

const interval = 1;
const iterations = parseInt(process.argv[2], 10) || 10000;

carotte.subscribe('hello-to-you', { queue: { durable: false } }, function() {
    bench.tick();
    return carotte.publish('hello-to-you', {})
        .then(() => true);
});

bench.start(iterations);

carotte.publish('hello-to-you', {});
