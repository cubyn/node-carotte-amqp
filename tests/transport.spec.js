const chai = require('chai');

const { expect } = chai;
chai.use(require('sinon-chai'));
const sinon = require('sinon');

const transport = {};
const carotte = require('./client')({
    autoDescribe: false,
    transport
});

beforeEach(() => {
    transport.info = sinon.fake();
    transport.error = sinon.fake();
});

afterEach(() => {
    sinon.restore();
});

describe('transport info', () => {
    it('should log the input with the correct payload', async () => {
        await carotte.subscribe('hello-transport', { queue: { exclusive: true } }, () => {
            return { result: 'hello-back' };
        });
        await carotte.invoke('hello-transport', {}, { query: 'hello-transport' });
        expect(transport.info).to.have.been.calledWithExactly(
            '▶  direct/hello-transport',
            sinon.match({
                destination: 'hello-transport',
                request: sinon.match({ query: 'hello-transport' }),
                requestSize: 76
            })
        );

        expect(transport.info).to.have.been.calledWithExactly(
            '◀  hello-transport',
            sinon.match({
                subscriber: 'hello-transport',
                request: sinon.match({ query: 'hello-transport' }),
                requestSize: 76,
                response: sinon.match({ result: 'hello-back' }),
                responseSize: 79,
                executionMs: sinon.match.number
            })
        );
    });

    it('includes the request payload in the output log when the execution throws an error', async () => {
        class CustomError extends Error {
            constructor() {
                super();
                this.name = 'CustomError';
            }
        }

        await carotte.subscribe(
            'throw-transport',
            { queue: { exclusive: true } },
            () => {
                throw new CustomError();
            }
        );
        await carotte.invoke('throw-transport', {}, { query: 'hello' }).then(
            () => {
                throw new Error('Expected execution to throw error');
            },
            (receivedError) => {
                expect(receivedError).to.include({ status: 500, name: 'CustomError' });
            }
        );

        expect(transport.info).to.have.been.calledWithExactly(
            '▶  direct/throw-transport',
            sinon.match({
                destination: 'throw-transport',
                request: sinon.match({ query: 'hello' }),
                requestSize: 66
            })
        );

        expect(transport.error).to.have.been.calledWithExactly(
            '◀  throw-transport',
            sinon.match({
                subscriber: 'throw-transport',
                request: sinon.match({ query: 'hello' }),
                requestSize: 66,
                error: sinon.match({ status: 500, name: 'CustomError' }),
                // exact size depends on the stack trace
                errorSize: sinon.match.number,
                executionMs: sinon.match.number
            })
        );
    });

    it('logs retry messages with context', async () => {
        const context = { transactionId: 'l3vkuzgg000ae2f3731a9wlu' };

        await carotte.subscribe('broken', () => {
            throw new Error('broken');
        });

        try {
            await carotte.invoke('broken', { context }, { query: 'hello' });

            throw new Error('never');
        } catch (error) {
            expect(error).to.have.property('message', 'broken');
        }

        expect(transport.info).to.have.been.calledWithExactly(
            '▶  direct/broken',
            sinon.match({
                context: sinon.match({ transactionId: 'l3vkuzgg000ae2f3731a9wlu' }),
                destination: 'broken',
                headers: sinon.match({
                    'x-retry-count': '1'
                }),
                request: sinon.match({ query: 'hello' }),
                requestSize: 109
            })
        );

    });
});
