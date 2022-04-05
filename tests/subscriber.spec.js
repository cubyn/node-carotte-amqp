const expect = require('chai').expect;
const carotte = require('./client')();

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
                expect(data).to.be.an('object');
                expect(data.hello).to.eql('world');
                expect(context.transactionId).to.eql('1234');
                done();
            })
            .then(() => carotte.publish('direct/hello1', {
                context: { transactionId: '1234' }
            }, { hello: 'world' }));
        });

        describe('when no logger is injected in subscribe', () => {
            it('should no provides the logger', done => {
                carotte.subscribe('direct/hello2', { queue: { exclusive: true } }, ({ logger }) => {
                    expect(logger).to.be.undefined;
                    done();
                })
                .then(() => carotte.publish('direct/hello2'));
            });
        });

        describe('when a logger is injected in subscribe', () => {
            it('should provides the logger with the current context', done => {
                const MESSAGE = 'message';
                const PID = 123;
                const TRANSACTION_ID = '1234';

                const queryContext = { transactionId: TRANSACTION_ID };
                const queryMeta = {};
                const options = { queue: { exclusive: true } };
                const originalLogger = {
                    log: () => {},
                    info: (message, ...meta) => {
                        expect(message).to.eql(MESSAGE);
                        expect(meta[0].pid).to.eql(PID);

                        return meta;
                    },
                    error: () => {},
                    warn: () => {}
                };

                carotte.subscribe('direct/hello3', options, ({ context, logger }) => {
                    expect(context.transactionId).to.eql(TRANSACTION_ID);
                    expect(logger).to.be.an('object');

                    const meta = logger.info(MESSAGE, { pid: PID });
                    expect(meta[0].transactionId).to.eql(TRANSACTION_ID);
                }, queryMeta, originalLogger)
                .then(() => carotte.publish('direct/hello3', { context: queryContext }, {}))
                .then(() => {
                    const meta = originalLogger.info(MESSAGE, { pid: PID });

                    // The logger in a Carotte function does not mutate the logger outside
                    // Avoid having logger with context outside Carotte functions
                    expect(meta[0].transactionId).to.be.undefined;

                    done();
                })
                .catch(done);
            });
        });
    });

    describe('fanout', () => {
        it('should be able to receive a message on a fanout exchange', done => {
            carotte.subscribe('fanout/queue-name', { queue: { exclusive: true } }, ({ data }) => {
                try {
                    expect(data.hello).to.eql('world');
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
                    expect(data.hello).to.eql('world');
                    done();
                } catch (err) {
                    done(err);
                }
            })
            .then(() => carotte.publish('topic/topic-key-1', { hello: 'world' }));
        });
    });

    describe('when the subscriber fails', () => {
        it('should republish a message', (done) => {
            let callCount = 0;
            carotte.subscribe('direct/republish', { queue: { exclusive: true } }, ({ data }) => {
                switch (callCount) {
                    case 0:
                        callCount++;
                        throw new Error('An error occured');
                    case 1:
                        callCount++;
                        throw 'An error occured'; // eslint-disable-line no-throw-literal
                    case 2:
                        callCount++;
                        throw { hello: 'stacktrace' }; // eslint-disable-line no-throw-literal
                    case 3:
                        callCount++;
                        throw 42; // eslint-disable-line no-throw-literal
                    case 4:
                        callCount++;
                        throw undefined; // eslint-disable-line no-throw-literal
                    default:
                        callCount++;
                        return done();
                }
            })
            .then(() => carotte.publish('direct/republish', { hello: 'world' }));
        });

        describe('when a retry policy is specified', () => {
            it('should retry', (done) => {
                let callCount = 0;
                carotte.subscribe('bye', { exclusive: true }, () => {
                    callCount++;
                    if (callCount === 4) {
                        setTimeout(done, 500);
                    } else if (callCount > 4) {
                        done.fail(new Error('CallCount > 4'));
                    } else {
                        throw new Error();
                    }
                }, { retry: { max: 3, interval: 0, strategy: 'direct' } })
                .then(() => carotte.publish('bye', {}));
            });

            describe('when the thrown error has a status attribute', () => {
                it('should not retry', () => {
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
                        expect(err.status).to.eql(400);
                        expect(err.message).to.not.eql('Should not be called a second time');
                    });
                });
            });
        });
    });
});
