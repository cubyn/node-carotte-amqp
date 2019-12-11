const expect = require('chai').expect;

const carotte = require('./client')({
    autoDescribe: false
});

const ERROR_MESSAGE = 'Woopsy!';

describe('dead-letter', () => {
    it('should send message in dead-letter queue when failing', () => {
        let deadletterError;

        return carotte.subscribe('dead-letter', ({ context, headers }) => {
            // we don't have a way to unsubscribe yet so we filter dead-letters
            // that are sent in other tests using this condition
            deadletterError = context.error;
        })
        .then(() => carotte.subscribe('direct/this-one-is-broken', () => {
            throw new Error(ERROR_MESSAGE);
        }))
        .then(() => carotte.invoke('direct/this-one-is-broken', {}))
        .then(() => {
            throw new Error('should not reach here');
        }, err => {
            // check that the deadletter queue received the right error
            expect(deadletterError.message).to.eql(ERROR_MESSAGE);

            // check that the consumer RPC queue received the right error
            expect(err.message).to.eql(ERROR_MESSAGE);
        });
    });
});
