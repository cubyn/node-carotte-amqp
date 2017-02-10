const expect = require('chai').expect;
const carotte = require('../src')({ enableBouillon: true });

describe('bouillon', () => {
    it('should answer to bouillon fanouts', () => {
        return carotte.invoke('fanout', { exchangeName: 'bouillon.fanout' }, { origin: 'master', type: 'all' })
            .then(({ data }) => {
                expect(data).to.be.defined;
                expect(data.name).to.be.eql('carotte');
            });
    });

    it('should answer to bouillon fanouts with subscribers schemas', () => {
        carotte.subscribe('bouillon.hello', { queue: { exclusive: true } }, () => { }, {
            requestSchema: {
                hello: 'world'
            },
            responseSchema: {
                foo: 'bar'
            }
        });

        return carotte.invoke('fanout', { exchangeName: 'bouillon.fanout' }, { origin: 'master', type: 'all' })
            .then(({ data }) => {
                expect(data).to.be.defined;
                expect(data.subscribers).to.be.defined;
                expect(data.subscribers['bouillon.hello']).to.be.defined;
                expect(data.subscribers['bouillon.hello'].requestSchema).to.be.defined;
                expect(data.subscribers['bouillon.hello'].responseSchema).to.be.defined;
                expect(data.subscribers['bouillon.hello'].requestSchema.hello).to.be.eql('world');
                expect(data.subscribers['bouillon.hello'].responseSchema.foo).to.be.eql('bar');
            });
    });
});
