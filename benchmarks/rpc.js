const carotte = require('../src')();
const bench = require('./tools');

const interval = 1;
const iterations = parseInt(process.argv[2], 10) || 10000;

carotte.subscribe('hello-to-you', function() {
    return 1;
});

bench.start(iterations);

setInterval(function() {
    carotte.invoke('hello-to-you', {})
        .then(() => {
            bench.tick();
        });
}, interval);