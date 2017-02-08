const expect = require('chai').expect;
const carotte = require('../src')();

describe('subscriber', () => {

    describe('direct', () => {

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

    describe('fanout', () => {

        it('should be able to send message on a fanout exchange', () => {
            return carotte.publish('fanout/fanout-routing-key', {})
                .then((res) => {
                    expect(res).to.be.true;
                });
        });

        it('should be able to receive a message on a fanout exchange', (done) => {
            carotte.subscribe('fanout/fanout-key-1/queue-name', ( { data } ) => {
                try {
                    expect(data.hello).to.be.defined;
                    expect(data.hello).to.be.eql('world');
                    //done();
                } catch(err) {
                    done(err);
                }
            });

            carotte.publish('fanout/fanout-key-1', { hello: 'world' });
        });
    });

    describe('topic', () => {

        it('should be able to send message on a topic exchange', () => {
            return carotte.publish('topic/topic-routing-key', {})
                .then((res) => {
                    expect(res).to.be.true;
                });
        });

        it('should be able to receive a message on a topic exchange', (done) => {
            carotte.subscribe('topic/topic-key-1/queue-name', ( { data } ) => {
                try {
                    expect(data.hello).to.be.defined;
                    expect(data.hello).to.be.eql('world');
                    //done();
                } catch (err) {
                    done(err);
                }
            });

            carotte.publish('topic/topic-key-1', { hello: 'world' });
        });
    });

    describe('republish', () => {

        it('should republish a message if subscriber fails', (done) => {
            let callCount = 0;
            carotte.subscribe('direct/republish', ( { data }) => {
                if (callCount === 1) return done();
                callCount++;
                throw new Error('An error occured');
            });

            carotte.publish('direct/republish', { hello: 'world' });
        });
    });
});