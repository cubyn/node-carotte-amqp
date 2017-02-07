const carotte = require('../')({
    host: 'localhost'
});


carotte.subscribe('topic/my.routing.key.a/my.routing.key.a', ({ data }) => {
    console.log(data);
}, {
    schema: {},
    permissions: []
});
