const carotte = require('../')({
    host: 'localhost'
});


[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(num => {
    carotte.invoke('direct/my.routing.key.a', {
        hello: num
    }).then(res => {
        console.log(num, '=',res);
    });
});


