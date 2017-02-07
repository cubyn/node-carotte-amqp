const carotte = require('../src')({
    host: 'localhost'
});

const num = 1;

carotte.invoke('direct/my.routing.key.a', {
    hello: num
}).then(res => {
    console.log(num, '=',res);
})

