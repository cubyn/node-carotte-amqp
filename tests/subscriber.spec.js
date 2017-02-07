const expect = require('chai').expect;
const carotte = require('../src')();

describe('subscriber', () => {
    it('should be able to receive a message on a queue (direct exchange)', done => {
        carotte.subscribe('direct/hello', () => {
            done();
        });

        carotte.publish('direct/hello', {});
    });

    it('should receive message on data object', done => {
        carotte.subscribe('direct/hello1', ( { data }) => {
            expect(data).to.be.defined;
            expect(data.hello).to.be.defined;
            expect(data.hello).to.be.eql('world');
            done();
        });

        carotte.publish('direct/hello1', { hello: 'world' });
    });
});