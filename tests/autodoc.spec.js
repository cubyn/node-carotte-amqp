const expect = require('chai').expect;
const carotte = require('./client')({ enableAutodoc: true });

describe('autodoc', () => {
    it('should answer to carotte fanouts', () => {
        return carotte.invoke('fanout', { exchangeName: 'carotte.fanout' }, { origin: 'master', type: 'all' })
            .then(data => {
                expect(data).not.to.be.undefined;
                expect(data.name).to.eql('carotte-amqp');
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
                expect(data).not.to.be.undefined;
                expect(data.subscribers).not.to.be.undefined;
                expect(data.subscribers['carotte.hello']).not.to.be.undefined;
                expect(data.subscribers['carotte.hello'].requestSchema).not.to.be.undefined;
                expect(data.subscribers['carotte.hello'].responseSchema).not.to.be.undefined;
                expect(data.subscribers['carotte.hello'].requestSchema.hello).to.eql('world');
                expect(data.subscribers['carotte.hello'].responseSchema.foo).to.eql('bar');
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
                expect(data).not.to.be.undefined;
                expect(data.subscribers).not.to.be.undefined;
                expect(data.subscribers['controller.hello']).not.to.be.undefined;
                expect(data.subscribers['kwontwoller.hello']).to.be.undefined;
            });
    });
});
