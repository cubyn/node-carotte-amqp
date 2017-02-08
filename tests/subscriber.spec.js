const expect = require('chai').expect;
const carotte = require('../src')();

describe('subscriber', () => {
    describe('direct', () => {
        it('should be able to receive a message on a queue (no option)', done => {
            carotte.subscribe('direct/hello', () => {
                done();
            })
            .then(() => carotte.publish('direct/hello', {}));
        });

        it('should receive message on data object', done => {
            carotte.subscribe('direct/hello1', { queue: { exclusive: true } }, ({ data }) => {
                expect(data).to.be.defined;
                expect(data.hello).to.be.defined;
                expect(data.hello).to.be.eql('world');
                done();
            })
            .then(() => carotte.publish('direct/hello1', { hello: 'world' }));
        });
    });

    describe('fanout', () => {
        it('should be able to receive a message on a fanout exchange', (done) => {
            carotte.subscribe('fanout/queue-name', { queue: { exclusive: true } }, ({ data }) => {
                try {
                    expect(data.hello).to.be.defined;
                    expect(data.hello).to.be.eql('world');
                    done();
                } catch (err) {
                    done(err);
                }
            })
            .then(() => carotte.publish('fanout', { hello: 'world' }));
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
            carotte.subscribe('topic/topic-key-1/my-queue-name', { queue: { exclusive: true } }, ({ data }) => {
                try {
                    expect(data.hello).to.be.defined;
                    expect(data.hello).to.be.eql('world');
                    done();
                } catch (err) {
                    done(err);
                }
            })
            .then(() => carotte.publish('topic/topic-key-1', { hello: 'world' }));
        });
    });

    describe('republish', () => {
        it('should republish a message if subscriber fails', (done) => {
            let callCount = 0;
            carotte.subscribe('direct/republish', { queue: { exclusive: true } }, ({ data }) => {
                if (callCount === 1) return done();
                callCount++;
                throw new Error('An error occured');
            })
            .then(() => carotte.publish('direct/republish', { hello: 'world' }));
        });
    });
});
