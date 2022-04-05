const expect = require('chai').expect;
const carotte = require('./client')({ enableAutodoc: true });

describe('autodoc', () => {
    it('should answer to carotte fanouts', () => {
        return carotte.invoke('fanout', { exchangeName: 'carotte.fanout' }, { origin: 'master', type: 'all' })
            .then(data => {
                expect(data).to.be.an('object');
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
                expect(data).to.be.an('object');
                expect(data.subscribers).to.be.an('object');
                expect(data.subscribers['carotte.hello']).to.be.an('object');
                expect(data.subscribers['carotte.hello'].requestSchema).to.be.an('object');
                expect(data.subscribers['carotte.hello'].responseSchema).to.be.an('object');
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
                expect(data).to.be.an('object');
                expect(data.subscribers).to.be.an('object');
                expect(data.subscribers).to.have.all.keys('controller.hello');
            });
    });
});
