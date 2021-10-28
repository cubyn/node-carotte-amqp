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
                request: sinon.match({ query: 'hello-transport' })
            })
        );

        expect(transport.info).to.have.been.calledWithExactly(
            '◀  hello-transport',
            sinon.match({
                subscriber: 'hello-transport',
                request: sinon.match({ query: 'hello-transport' }),
                response: sinon.match({ result: 'hello-back' })
            })
        );
    });
});
