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

        return carotte.invoke('direct/hello-rpc2', {}, {})
            .then(({ data }) => {
                expect(data).to.be.defined;
                expect(data.a).to.be.eql(2);
            });
    });
});