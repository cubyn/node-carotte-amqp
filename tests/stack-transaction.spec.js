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

describe('Local transactionId', () => {
    const options = { queue: { exclusive: true } };

    it('should create a transactionStack when it\'s not defined', async () => {
        await carotte.subscribe('stack-test-1-1', options,
            ({ context }) => context.transactionStack);

        const context = {};
        const subStack1 = await carotte.invoke('stack-test-1-1', { context }, {});
        expect(subStack1).to.have.length(1);

        const subStack2 = await carotte.invoke('stack-test-1-1', { context }, {});
        expect(subStack2).to.have.length(1);
        // subcalls should have different transaction stack ids
        expect(subStack2).to.not.deep.eql(subStack1);

        // subcalls should not pollute parent context transaction props
        expect(context.transactionStack).to.not.exist;
    });

    it('should add new transactionStack id to transactionStack', async () => {
        await carotte.subscribe('stack-test-2-1', options,
            ({ context }) => context.transactionStack);

        const transactionStack = ['a', 'b'];
        const context = { transactionStack };
        const subStack = await carotte.invoke('stack-test-2-1', { context }, {});

        expect(context.transactionStack).to.have.length(2);
        expect(subStack).to.include.members(transactionStack);
        expect(subStack).to.have.length(3);
    });

    it('should add transactionStack ids in cascade', async () => {
        await carotte.subscribe('stack-test-3-1', options, ({ context, invoke }) => {
            expect(context).to.be.defined;
            expect(context.transactionStack).to.be.defined;
            expect(context.transactionStack).to.be.an('array');
            expect(context.transactionStack).to.have.length(1);
            return invoke('stack-test-3-2', {});
        });

        await carotte.subscribe('stack-test-3-2', options, ({ context, invoke }) => {
            expect(context.transactionStack).to.have.length(2);
            return invoke('stack-test-3-3', {});
        });

        await carotte.subscribe('stack-test-3-3', options, ({ context, invoke }) => {
            expect(context.transactionStack).to.have.length(3);
            return invoke('stack-test-3-4', {});
        });

        await carotte.subscribe('stack-test-3-4', options, ({ context }) => {
            expect(context.transactionStack).to.have.length(4);
            return true;
        });

        return carotte.invoke('stack-test-3-1', {});
    });

    it('should only add stack transaction ids to there rights branchs', async () => {
        let stackId1 = '';
        let stackId4 = '';

        await carotte.subscribe('stack-test-4-1', options, ({ context, invoke }) => {
            stackId1 = context.transactionStack[0];
            expect(context).to.be.defined;
            expect(context.transactionStack).to.be.defined;
            expect(context.transactionStack).to.be.an('array');
            expect(context.transactionStack).to.have.length(1);

            invoke('stack-test-4-2', {});
            invoke('stack-test-4-3', {});
            return invoke('stack-test-4-4', {});
        });

        await carotte.subscribe('stack-test-4-2', options, ({ context }) => {
            expect(context['origin-consumer']).to.be.deep.eql('stack-test-4-1');
            expect(context.transactionStack).to.have.length(2);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            return true;
        });

        await carotte.subscribe('stack-test-4-3', options, ({ context }) => {
            expect(context['origin-consumer']).to.be.deep.eql('stack-test-4-1');
            expect(context.transactionStack).to.have.length(2);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            return true;
        });

        await carotte.subscribe('stack-test-4-4', options, ({ context, invoke }) => {
            stackId4 = context.transactionStack[1];
            expect(context.transactionStack).to.have.length(2);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            invoke('stack-test-4-5', {});
            invoke('stack-test-4-6', {});
            return invoke('stack-test-4-7', {});
        });

        await carotte.subscribe('stack-test-4-5', options, ({ context }) => {
            expect(context['origin-consumer']).to.be.deep.eql('stack-test-4-4');
            expect(context.transactionStack).to.have.length(3);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            expect(context.transactionStack[1]).to.be.eql(stackId4);
            return true;
        });

        await carotte.subscribe('stack-test-4-6', options, ({ context }) => {
            expect(context['origin-consumer']).to.be.deep.eql('stack-test-4-4');
            expect(context.transactionStack).to.have.length(3);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            expect(context.transactionStack[1]).to.be.eql(stackId4);
            return true;
        });

        await carotte.subscribe('stack-test-4-7', options, ({ context }) => {
            expect(context['origin-consumer']).to.be.deep.eql('stack-test-4-4');
            expect(context.transactionStack).to.have.length(3);
            expect(context.transactionStack[0]).to.be.eql(stackId1);
            expect(context.transactionStack[1]).to.be.eql(stackId4);
            return true;
        });

        return carotte.invoke('stack-test-4-1', {});
    });

    it('should log the input with the correct stack', async () => {
        await carotte.subscribe('stack-test-5-1', options, ({ context }) => context.transactionStack);
        const transactionStack = await carotte.invoke('stack-test-5-1', { context: {} }, {});
        expect(transport.info).to.have.been.calledWithExactly(
            '▶  direct/stack-test-5-1',
            sinon.match.has(
                'context',
                sinon.match.has(
                    'transactionStack',
                    transactionStack
                )
            )
        );
        expect(transport.info).to.have.been.calledWithExactly(
            '◀  stack-test-5-1',
            sinon.match.has(
                'context',
                sinon.match.has(
                    'transactionStack',
                    transactionStack
                )
            )
        );
    });
});
