const expect = require('chai').expect;
const carotte = require('./client');

describe('publisher', () => {
    it('should return a promise', () => {
        const returnValue = carotte().publish('', {});
        expect(returnValue).not.to.be.undefined;
        expect(typeof returnValue).to.be.eql('object');
        expect(returnValue.then).not.to.be.undefined;
        expect(typeof returnValue.then).to.be.eql('function');
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
});
