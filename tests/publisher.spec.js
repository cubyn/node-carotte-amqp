const expect = require('chai').expect;
const sinon = require('sinon');
const amqplibChannel = require('amqplib/lib/channel_model');
const carotte = require('./client');

const sandbox = sinon.createSandbox();

describe('publisher', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('should return a promise', () => {
        const returnValue = carotte().publish('', {});
        expect(returnValue).to.be.a('promise');
        expect(returnValue.then).to.be.a('function');
    });

    it('should resolve with broker publication status, and should be able to publish', () => {
        return carotte().publish('')
            .then(res => {
                expect(res).to.be.eql(true);
            });
    });

    it('should be able to publish two message in a row', () => {
        const freshCarotte = carotte();

        return Promise.all([freshCarotte.publish('', {}), freshCarotte.publish('', {})])
            .then(res => {
                expect(res[0]).to.be.eql(true);
                expect(res[1]).to.be.eql(true);
            });
    });

    it('should not be able to publish when defining a bad exchange (making default exchange non-durable)', () => {
        return carotte().publish('', { durable: false }, {})
            .then(res => {
                throw new Error('Should not pass');
            })
            .catch(err => {
                expect(err.message).not.to.be.eql('Should not pass');
            });
    });

    it('should add debug token if available', async () => {
        const channelPublishSpy = sandbox.spy(amqplibChannel.Channel.prototype, 'publish');
        const client = carotte();

        const qualifier = 'some.qualifier:v1:describe';
        const qualifierV2 = `${qualifier}:v2`;
        const debugToken = 'debug-test-12';
        const spy = sinon.spy();
        await client.subscribe(`${qualifierV2}:${debugToken}`, () => {
            spy();
        });

        const options = {
            context: {
                debugToken
            }
        };
        /**
         * first call will reject and cause channel destruction
         */
        await Promise.race([qualifier, qualifierV2]
            .map(queue => client.invoke(queue, options, {}))
        );

        sinon.assert.calledOnce(spy);
        sinon.assert.calledThrice(channelPublishSpy);
        sinon.assert.calledWithExactly(
            channelPublishSpy.firstCall,
            'amq.direct',
            'some.qualifier:v1:describe',
            sinon.match.any,
            sinon.match.any
        );
        sinon.assert.calledWithExactly(
            channelPublishSpy.secondCall,
            'amq.direct',
            'some.qualifier:v1:describe:v2:debug-test-12',
            sinon.match.any,
            sinon.match.any
        );
        /** rpc answer */
        sinon.assert.calledWithExactly(
            channelPublishSpy.thirdCall,
            'amq.direct',
            sinon.match.string,
            sinon.match.any,
            sinon.match.any
        );
    });
});
