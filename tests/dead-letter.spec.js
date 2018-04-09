const carotte = require('./client')({
    autoDescribe: false
});

describe('dead-letter', () => {
    it('should send message in dead-letter queue when failing', (done) => {
        carotte.subscribe('dead-letter', ({ context, headers }) => {
            // we don't have a way to unsubscribe yet so we filter dead-letters
            // that are sent in other tests using this condition
            if (context.error.message === 'Woopsy!') {
                done();
            }
        })
        .then(() => carotte.subscribe('direct/this-one-is-broken', () => {
            throw new Error('Woopsy!');
        }))
        .then(() => carotte.invoke('direct/this-one-is-broken', {}));
    });
});
