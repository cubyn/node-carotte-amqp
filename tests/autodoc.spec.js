const expect = require('chai').expect;
const carotte = require('../src')({ enableAutodoc: true });

describe('autodoc', () => {
    it('should answer to carotte fanouts', () => {
        return carotte.invoke('fanout', { exchangeName: 'carotte.fanout' }, { origin: 'master', type: 'all' })
            .then(data => {
                expect(data).to.be.defined;
                expect(data.name).to.be.eql('carotte-amqp');
            });
    });

    it('should answer to carotte fanouts with subscribers schemas', () => {
        carotte.subscribe('carotte.hello', { queue: { exclusive: true } }, () => { }, {
            requestSchema: {
                hello: 'world'
            },
            responseSchema: {
                foo: 'bar'
            }
        });

        return carotte.invoke('fanout', { exchangeName: 'carotte.fanout' }, { origin: 'master', type: 'all' })
            .then(data => {
                expect(data).to.be.defined;
                expect(data.subscribers).to.be.defined;
                expect(data.subscribers['carotte.hello']).to.be.defined;
                expect(data.subscribers['carotte.hello'].requestSchema).to.be.defined;
                expect(data.subscribers['carotte.hello'].responseSchema).to.be.defined;
                expect(data.subscribers['carotte.hello'].requestSchema.hello).to.be.eql('world');
                expect(data.subscribers['carotte.hello'].responseSchema.foo).to.be.eql('bar');
            });
    });

    it('Should only list subscribers who are controllers', () => {
        carotte.subscribe('controller.hello', { queue: { exclusive: true } }, () => { }, {
            requestSchema: {
                hello: 'world'
            },
            responseSchema: {
                foo: 'bar'
            }
        });

        carotte.subscribe('kwontwoller.hello', { queue: { exclusive: true } }, () => { }, {
            requestSchema: {
                hello: 'world'
            },
            responseSchema: {
                foo: 'bar'
            }
        });

        return carotte.invoke('fanout', { exchangeName: 'carotte.fanout' }, { origin: 'gateway', type: 'controller' })
            .then(data => {
                expect(data).to.be.defined;
                expect(data.subscribers).to.be.defined;
                expect(data.subscribers['controller.hello']).to.be.defined;
                expect(data.subscribers['kwontwoller.hello']).to.be.undefined;
            });
    });
});
