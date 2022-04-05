const expect = require('chai').expect;
const carotte = require('../src');

describe('entry point', () => {
    it('shoud expose a function', () => {
        expect(carotte).to.be.a('function');
    });

    it('should return a builded object exposing carotte API', () => {
        const instance = carotte();
        expect(instance).to.be.an('object');
        expect(instance.invoke).to.be.a('function');
        expect(instance.publish).to.be.a('function');
        expect(instance.subscribe).to.be.a('function');
    });
});
