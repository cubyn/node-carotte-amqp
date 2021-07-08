const expect = require('chai').expect;
const carotte = require('../src');

describe('entry point', () => {
    it('shoud expose a function', () => {
        expect(carotte).not.to.be.undefined;
        expect(typeof carotte).to.eql('function');
    });

    it('should return a builded object exposing carotte API', () => {
        const instance = carotte();
        expect(instance).not.to.be.undefined;
        expect(instance.invoke).not.to.be.undefined;
        expect(instance.publish).not.to.be.undefined;
        expect(instance.subscribe).not.to.be.undefined;
        expect(typeof instance.invoke).to.eql('function');
        expect(typeof instance.publish).to.eql('function');
        expect(typeof instance.subscribe).to.eql('function');
    });
});
