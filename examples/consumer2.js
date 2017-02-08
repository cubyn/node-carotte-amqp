const carotte = require('../src')({
    host: 'localhost'
});


carotte.subscribe('direct/my.routing.key.a/my.routing.key.a', ({ data }) => {
    return new Promise(resolve => setTimeout(() => resolve(data), 10000));
}, {
    schema: {},
    permissions: []
});
