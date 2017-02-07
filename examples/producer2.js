const carotte = require('../')({
    host: 'localhost'
});


carotte.publish('topic/my.routing.key.a', {
    hello: 'world'
});

