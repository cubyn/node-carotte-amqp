const expect = require('chai').expect;
const sinon = require('sinon');
const Puid = require('puid');
const carotteFactory = require('./client');

const ERROR_MESSAGE = 'Woopsy!';

describe('dead-letter', () => {
    let uid;
    let deadLetterQualifier;
    let primaryCarotte;
    let secondaryCarotte;
    let deadLetterClient;

    beforeEach(() => {
        uid = new Puid().generate();
        deadLetterQualifier = `dead-letter-${uid}`;
        primaryCarotte = carotteFactory({ serviceName: 'primary', autoDescribe: false, deadLetterQualifier });
        secondaryCarotte = carotteFactory({ serviceName: 'secondary', autoDescribe: false, deadLetterQualifier });
        deadLetterClient = carotteFactory({ serviceName: 'deadletter', autoDescribe: false, enableDeadLetter: false });
    });

    it('should send message in dead-letter queue when failing', async () => {
        const deadLetterMock = sinon.stub().resolves();
        await primaryCarotte.subscribe(deadLetterQualifier, deadLetterMock);

        const brokenMock = sinon.stub().callsFake(() => {
            throw new Error(ERROR_MESSAGE);
        });
        await primaryCarotte.subscribe(`direct/dead-letter-broken-handler-${uid}`, brokenMock);

        try {
            await primaryCarotte.invoke(`direct/dead-letter-broken-handler-${uid}`, {});
            throw new Error('should throw');
        } catch (error) {
            expect(error).to.be.an.instanceOf(Error)
                .and.to.have.property('message', ERROR_MESSAGE);
        }

        sinon.assert.calledOnce(deadLetterMock);
        sinon.assert.calledWithExactly(deadLetterMock, sinon
            .match(({ headers }) => {
                return !headers['x-reply-to'];
            }, 'header x-reply-to should not be defined')
            .and(sinon.match(({ headers }) => {
                return !headers['x-correlation-id'];
            }, 'header x-correlation-id should not be defined'))
        );
        sinon.assert.callCount(brokenMock, 5 + 1);
    });


    it('should not forward dead letter response to original publisher', async () => {
        // adding a delay to failing handler replyToPublisher in order
        // to get dead letter message consumed first
        const originalReplyToPublisher = secondaryCarotte.replyToPublisher;
        sinon.stub(secondaryCarotte, 'replyToPublisher').callsFake(async (...args) => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(originalReplyToPublisher(...args));
                }, 500);
            });
        });

        const deadLetterMock = sinon.stub().resolves();
        await deadLetterClient.subscribe(deadLetterQualifier, deadLetterMock);

        const primaryMock = sinon.stub().callsFake(async () => {
            return primaryCarotte.invoke(`direct/dead-letter-broken-handler-${uid}`, {});
        });
        await primaryCarotte.subscribe(`direct/dead-letter-primary-handler-${uid}`, primaryMock);

        const brokenMock = sinon.stub().callsFake(() => {
            throw new Error(ERROR_MESSAGE);
        });
        await secondaryCarotte.subscribe(`direct/dead-letter-broken-handler-${uid}`, brokenMock);

        try {
            await primaryCarotte.invoke(`direct/dead-letter-primary-handler-${uid}`, {});
            throw new Error('should throw');
        } catch (error) {
            expect(error).to.be.an.instanceOf(Error)
                .and.to.have.property('message', ERROR_MESSAGE);
        }

        sinon.assert.calledOnce(deadLetterMock);
        sinon.assert.calledWithExactly(deadLetterMock, sinon
            .match(({ headers }) => {
                return !headers['x-reply-to'];
            }, 'header x-reply-to should not be defined')
            .and(sinon.match(({ headers }) => {
                return !headers['x-correlation-id'];
            }, 'header x-correlation-id should not be defined'))
        );
        sinon.assert.callCount(brokenMock, 5 + 1);
        sinon.assert.calledOnce(primaryMock);
        sinon.assert.calledOnce(secondaryCarotte.replyToPublisher);
    });
});
