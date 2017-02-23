const carotte = require('../src')();
const bench = require('./tools');

const interval = 1;
const iterations = parseInt(process.argv[2], 10) || 10000;

carotte.subscribe('retry', function({ data, headers }) {
    throw new Error('nok');
}, { retry: { max: 5 } });

bench.start(iterations);

setInterval(function() {
    carotte.invoke('retry', {})
        .catch(() => {
            bench.tick();
        });
}, interval);

let dead_lettered = 0;
carotte.subscribe('dead-letter', function({ data, headers }) {
    if (dead_lettered++ === iterations) {
        console.log('Got all dead letters');
    }
});