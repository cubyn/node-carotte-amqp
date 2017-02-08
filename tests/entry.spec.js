const expect = require('chai').expect;
const carotte = require('../src');

describe('entry point', () => {
    it('shoud expose a function', () => {
        expect(carotte).to.be.defined;
        expect(typeof carotte).to.be.eql('function');
    });

    it('should return a builded object exposing carotte API', () => {
        const instance = carotte();
        expect(instance).to.be.defined;
        expect(instance.invoke).to.be.defined;
        expect(instance.publish).to.be.defined;
        expect(instance.subscribe).to.be.defined;
        expect(typeof instance.invoke).to.be.eql('function');
        expect(typeof instance.publish).to.be.eql('function');
        expect(typeof instance.subscribe).to.be.eql('function');
    });
});
