const expect = require('chai').expect;
const carotte = require('../src')();

describe('rpc', () => {
    it('should be able to receive a response from a queue', () => {
        carotte.subscribe('direct/hello-rpc', () => {
            return { a: 1 };
        });

        return carotte.invoke('direct/hello-rpc', {}, {})
            .then(({ data }) => {
                expect(data).to.be.defined;
                expect(data.a).to.be.eql(1);
            });
    });

    it('should receive response on data object', () => {
        carotte.subscribe('direct/hello-rpc2', ( { data }) => {
            return { a: 2 };
        });

        return carotte.invoke('direct/hello-rpc2', {})
            .then(({ data }) => {
                expect(data).to.be.defined;
                expect(data.a).to.be.eql(2);
            });
    });

    it('should not handle RPC response if consumer respond with bad correlation ID', (done) => {
        carotte.subscribe('direct/hello-rpc3', ( { data, headers }) => {
            try {
                headers['x-correlation-id'] = 'toto';
                setTimeout(done, 1000);
                return { a: 2 };
            } catch(err) {
                done(err);
            }
        });

        carotte.invoke('direct/hello-rpc3', {})
            .then(({ data }) => {
                throw new Error('Should not execute callback');
            });
    });
});