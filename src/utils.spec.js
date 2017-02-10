const expect = require('chai').expect;
const utils = require('./utils');

describe('utils', () => {
    describe('identity', () => {
        it('should return a function that return the provided parameter', () => {
            expect(utils.identity(1)()).to.be.eql(1);
        });
    });

    describe('execInPromise', () => {
        it('should return a promise that resolve with provided function resolve', () => {
            return utils.execInPromise((a) => {
                return a;
            }, 1)
            .then((res) => {
                expect(res).to.be.eql(1);
            });
        });
    });

    describe('createDeferred', () => {
        it('should create a deferred promise object', () => {
            const deferred = utils.createDeferred();
            expect(deferred.promise).to.be.defined;

            deferred.resolve();

            return deferred.promise;
        });
    });

    describe('deserializeError', () => {
        it('should return provided error if its type is error', () => {
            const error = new Error('hello');
            const deserialized = utils.deserializeError(error);

            expect(deserialized).to.deep.equal(error);
        });

        it('should parse provided string and return it as error', () => {
            const error = { hello: 'world' };
            const deserialized = utils.deserializeError(JSON.stringify(error));
            expect(deserialized).to.deep.equal(error);
        });

        it('should return string as-is if invalid JSON', () => {
            const error = `${JSON.stringify({ hello: 'world' })}aaa`;
            const deserialized = utils.deserializeError(error);
            expect(deserialized).to.deep.equal(new Error(error));
        });

        it('should work with error objects', () => {
            const deserialized = utils.deserializeError({ message: 'Hello' });
            expect(deserialized).to.deep.equal(new Error('hello'));
        });
    });

    describe('serializeError', () => {
        it('should return an object with all error properties including own properties', () => {
            const error = new Error('hello');
            error.status = 400;
            const serialized = utils.serializeError(error);

            expect(serialized).to.be.an('object');
            expect(serialized.message).to.be.an('string')
                .to.equal('hello');
            expect(serialized.status).to.be.an('number')
                .to.equal(400);
            expect(serialized.stack).to.be.an('string');
        });
    });
});
