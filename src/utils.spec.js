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
});
