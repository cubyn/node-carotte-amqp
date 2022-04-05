const expect = require('chai').expect;
const constants = require('./constants');

describe('constants', () => {
    it('should expose exchange types', () => {
        expect(constants.EXCHANGE_TYPE).to.be.an('object');
        expect(constants.EXCHANGE_TYPE.DIRECT).to.be.a('string');
        expect(constants.EXCHANGE_TYPE.FANOUT).to.be.a('string');
        expect(constants.EXCHANGE_TYPE.TOPIC).to.be.a('string');
        expect(constants.EXCHANGE_TYPE.HEADERS).to.be.a('string');
    });

    it('should store exchange types to available exchanges array', () => {
        expect(constants.EXCHANGES_AVAILABLE).to.be.an('array');
        expect(constants.EXCHANGES_AVAILABLE)
            .to.have.members(Object.values(constants.EXCHANGE_TYPE));
    });
});
