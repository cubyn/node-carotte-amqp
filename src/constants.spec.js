const expect = require('chai').expect;
const constants = require('./constants');

describe('constants', () => {
    it('should expose exchange types', () => {
        expect(constants.EXCHANGE_TYPE).to.be.defined;
        expect(constants.EXCHANGE_TYPE.DIRECT).to.be.defined;
        expect(constants.EXCHANGE_TYPE.FANOUT).to.be.defined;
        expect(constants.EXCHANGE_TYPE.TOPIC).to.be.defined;
        expect(constants.EXCHANGE_TYPE.HEADERS).to.be.defined;
    });

    it('should store exchange types to available exchanges array', () => {
        expect(constants.EXCHANGES_AVAILABLE).to.be.defined;
        expect(constants.EXCHANGES_AVAILABLE.includes(constants.EXCHANGE_TYPE.DIRECT));
    });
});
