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
            carotte.subscribe('direct/hello1', {
                queue: { exclusive: true }
            }, ({ data, context }) => {
                expect(data).to.be.defined;
                expect(data.hello).to.be.defined;
                expect(data.hello).to.be.eql('world');
                expect(context.transactionId).to.be.eql('1234');
                done();
            })
            .then(() => carotte.publish('direct/hello1', {
                context: { transactionId: '1234' }
            }, { hello: 'world' }));
        });
    });

    describe('fanout', () => {
        it('should be able to receive a message on a fanout exchange', done => {
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

        it('should be able to receive a message on a topic exchange', done => {
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
        it('should republish a message if subscriber fails', done => {
            let callCount = 0;
            carotte.subscribe('direct/republish', { queue: { exclusive: true } }, ({ data }) => {
                if (callCount === 1) return done();
                callCount++;
                throw new Error('An error occured');
            })
            .then(() => carotte.publish('direct/republish', { hello: 'world' }));
        });
    });

    describe('retry', () => {
        it('should retry when retry is specified', done => {
            let callCount = 0;
            carotte.subscribe('bye', { exclusive: true }, () => {
                callCount++;
                if (callCount === 4) {
                    setTimeout(done, 500);
                } else if (callCount > 4) {
                    done(new Error('CallCount > 4'));
                } else {
                    throw new Error();
                }
            }, { retry: { max: 3, interval: 0, strategy: 'direct' } })
            .then(() => carotte.publish('bye', {}));
        });

        it('should not retry when retry is specified but error with status is thrown', () => {
            let callCount = 0;
            return carotte.subscribe('bye2', { exclusive: true }, () => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Should not be called a second time');
                } else {
                    const err = new Error();
                    err.status = 400;
                    throw err;
                }
            }, { retry: { max: 3, interval: 0, strategy: 'direct' } })
            .then(() => carotte.invoke('bye2', {}))
            .then(() => {
                throw new Error('Should not succeed');
            })
            .catch((err) => {
                expect(err.status).to.be.eql(400);
                expect(err.message).to.not.be.eql('Should not be called a second time');
            });
        });
    });
});
