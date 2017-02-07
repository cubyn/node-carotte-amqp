const carotte = require('../src')({
    host: 'localhost'
});


carotte.subscribe('direct/my.routing.key.a/my.routing.key.a', ({ data }) => {
    return data;
}, {
    schema: {},
    permissions: []
});
