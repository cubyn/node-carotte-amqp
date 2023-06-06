const expect = require('chai').expect;
const carotteFactory = require('./client');
const sinon = require('sinon');

const sandbox = sinon.createSandbox();

describe('rpc', () => {
    /** @type {ReturnType<carotteFactory>} */
    let carotte = carotteFactory();

    afterEach(() => {
        sandbox.restore();
    });

    describe('shutdown', () => {
        beforeEach(() => {
            carotte = carotteFactory();
        });

        describe('when connection has been initialized', () => {
            it('shutdowns the client', () => {
                return carotte
            .subscribe(
              'fanout/abcdef',
              { exchangeName: 'test2', queue: { exclusive: true } },
              ({ data }) => data
            )
            .then(() => {
                return carotte.shutdown();
            });
            }).timeout(5000);
        });

        describe('when connection has NOT been initialized', () => {
            it('shutdowns the client', () => {
                return carotte.shutdown();
            }).timeout(5000);
        });
    });

    describe('invoke', () => {
        beforeEach(() => {
            carotte = carotteFactory();
        });

        it('should be able to receive a response from a queue', () => {
            return carotte.subscribe('direct/hello-rpc', { queue: { exclusive: true } }, () => {
                return { a: 1 };
            })
            .then(() => {
                return carotte.invoke('direct/hello-rpc', {}, {})
                    .then(data => {
                        expect(data).to.be.an('object');
                        expect(data.a).to.eql(1);
                    });
            });
        });

        it('should receive response on data object', () => {
            carotte.subscribe('direct/hello-rpc2', { queue: { exclusive: true } }, ({ data }) => {
                return { a: 2 };
            })
            .then(() => {
                return carotte.invoke('direct/hello-rpc2', {})
                    .then(data => {
                        expect(data).to.be.an('object');
                        expect(data.a).to.eql(2);
                    });
            });
        });

        it('should not handle RPC response if consumer respond with bad correlation ID', (done) => {
            carotte.subscribe('direct/hello-rpc3', { queue: { exclusive: true } }, ({ data, headers }) => {
                try {
                    headers['x-correlation-id'] = 'toto';
                    setTimeout(done, 1000);
                    return { a: 2 };
                } catch (err) {
                    return done(err);
                }
            })
            .then(() => {
                carotte.invoke('direct/hello-rpc3', {})
                    .then(data => {
                        done(new Error('Should not execute callback'));
                    });
            });
        });

        it('should not close and resubscribe if queue does not exist with provided debug token', async () => {
            const subscribeSpy = sandbox.spy(carotte, 'subscribe');
            await carotte.subscribe(
                'direct/hello-rpc-34',
                { queue: { exclusive: true } },
                () => ({ a: 2 })
            );

            const timeout = 200;
            // classic call
            await carotte.invoke('direct/hello-rpc-34', { timeout }, {});
            // queue does not exist and will close the channel
            await carotte.invoke(
                'direct/hello-rpc-34',
                {
                    context: { debugToken: 'test-nope' },
                    timeout
                },
                {}
            );
            try {
                await carotte.invoke('direct/hello-rpc-56', { timeout }, {});
            } catch (error) {
                expect(error).to.be.an.instanceOf(Error);
                expect(error.message).to.equal(`${timeout}ms timeout reached`);
            }

            sinon.assert.calledTwice(subscribeSpy);
            sinon.assert.calledWithExactly(
                subscribeSpy,
                'direct/hello-rpc-34',
                { queue: { exclusive: true } },
                sinon.match.func
            );
            sinon.assert.calledWithExactly(
                subscribeSpy,
                '',
                { queue: { exclusive: true, durable: false } },
                sinon.match.func
            );
        });
    });

    describe('parallel', () => {
        it('should receive response from multiple consumer with parallel', (done) => {
            carotte.subscribe('fanout/hello-rpc1', { exchangeName: 'test', exclusive: false, queue: { exclusive: true } }, ({ data }) => {
                return { a: 2 };
            })
            .then(() => {
                return carotte.subscribe('fanout/hello-rpc2', { exchangeName: 'test', exclusive: false, queue: { exclusive: true } }, ({ data }) => {
                    return { a: 2 };
                });
            })
            .then(() => {
                let counter = 0;
                return carotte.parallelWithFullResponse('fanout', { exchangeName: 'test' }, { hello: 'world' }, (err, { data }) => {
                    expect(data.a).to.eql(2);
                    counter++;
                    if (counter === 2) {
                        done();
                    }
                });
            });
        });

        it('should be able to omit options parameter', (done) => {
            carotte.subscribe('fanout/abcdef', { exchangeName: 'test2', queue: { exclusive: true } }, ({ data }) => {
                return { a: 2 };
            })
            .then(() => {
                return carotte.parallel('fanout', { exchangeName: 'test2', hello: 'world' }, {}, (error, data) => {
                    expect(data.a).to.eql(2);
                    done();
                });
            });
        });

        it('should be able to receive execution errors', (done) => {
            carotte.subscribe('fanout/abcdefg', { durable: false, exchangeName: 'errors', queue: { exclusive: true } }, ({ data }) => {
                throw new Error('nope');
            }, { retry: { max: 5 } })
            .then(() => {
                return carotte.parallel('fanout', { durable: false, exchangeName: 'errors' }, { hello: 'world' }, (error) => {
                    expect(error.message).to.eql('nope');
                    done();
                });
            });
        });

        it('should be able to clear a parallel execution', (done) => {
            carotte.subscribe('fanout/hello-rpc1', { exchangeName: 'test', exclusive: false, queue: { exclusive: true } }, ({ data }) => {
                return { a: 2 };
            })
            .then(() => {
                return carotte.subscribe('fanout/hello-rpc2', { exchangeName: 'test', exclusive: false, queue: { exclusive: true } }, ({ data }) => {
                    return { a: 2 };
                });
            })
            .then(() => {
                let counter = 0;
                const puid = carotte.parallel('fanout', { exchangeName: 'test' }, { hello: 'world' }, () => {
                    counter++;
                    carotte.clearParallel(puid);
                    setTimeout(done, 1000);
                    if (counter === 2) {
                        done(new Error('Should not have executed twice'));
                    }
                });
            });
        });
    });

    describe('distributed tracing', () => {
        it('should propagate context between calls', () => {
            return carotte.subscribe('direct/distributed-tracing-rpc', { queue: { exclusive: true } }, ({ context, invoke }) => {
                context.hello = 1;
                return invoke('direct/distributed-tracing-rpc-2');
            })
            .then(() => {
                return carotte.subscribe('direct/distributed-tracing-rpc-2', { queue: { exclusive: true } }, ({ context, invoke }) => {
                    expect(context.hello).to.eql(1);
                    context.hello++;
                    return { a: 1 };
                });
            })
            .then(() => {
                return carotte.invokeWithFullResponse('direct/distributed-tracing-rpc', {})
                    .then(({ data, context }) => {
                        expect(context.hello).to.eql(2);
                        expect(data).to.be.an('object');
                        expect(data.a).to.eql(1);
                    });
            });
        });
    });
});
