const carotte = require('../src')();
const bench = require('./tools');

const interval = 1;
const iterations = parseInt(process.argv[2], 10) || 10000;

carotte.subscribe('retry', function({ data, headers }) {
    if (headers['x-retry-count']) {
        return 1;
    }
    throw new Error('nok');
});

bench.start(iterations);

setInterval(function() {
    carotte.invoke('retry', {})
        .then(() => {
            bench.tick();
        });
}, interval);