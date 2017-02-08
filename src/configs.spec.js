const expect = require('chai').expect;
const configs = require('./configs');
const { EXCHANGE_TYPE } = require('./constants');

describe('configs', () => {
    describe('getPackageJson', () => {
        const pwd = process.env.PWD;

        afterEach(() => {
            process.env.PWD = pwd;
        });

        it('should be able to retrieve package informations', () => {
            const packageInfos = configs.getPackageJson();
            expect(typeof packageInfos).to.be.eql('object');
            expect(packageInfos.name).to.be.defined;
            expect(packageInfos.name).to.be.eql('carotte');
        });

        it('should return an empty object when no package.json is found', () => {
            process.env.PWD = 'toto';
            const packageInfos = configs.getPackageJson();
            expect(packageInfos).to.be.defined;
            expect(Object.keys(packageInfos).length).to.be.eql(0);
        });
    });

    describe('parseQualifier', () => {
        it('should fallback to DIRECT if no exchange type is provided', () => {
            const qualifier = configs.parseQualifier('hello-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.type).to.be.eql(EXCHANGE_TYPE.DIRECT);
        });

        it('should fallback to DIRECT if empty exchange provided', () => {
            const qualifier = configs.parseQualifier('/hello-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.type).to.be.eql(EXCHANGE_TYPE.DIRECT);
        });

        it('should extract exchange type from qualifier string', () => {
            const qualifier = configs.parseQualifier('something/hello-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.type).to.be.eql('something');
        });

        it('should extract routing key from qualifier string', () => {
            const qualifier = configs.parseQualifier('something/hello-world/bad-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.routingKey).to.be.eql('hello-world');
        });

        it('should have empty routing key if no routing key provided', () => {
            const qualifier = configs.parseQualifier('something//bad-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.routingKey).to.be.eql('');
        });

        it('should extract queue name from qualifier string', () => {
            const qualifier = configs.parseQualifier('something/hello-world/bad-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.queueName).to.be.eql('bad-world');
        });

        it('should have empty queue name if no queue name provided', () => {
            const qualifier = configs.parseQualifier('something/hello-world');
            expect(qualifier).to.be.defined;
            expect(qualifier.queueName).to.be.eql('');
        });
    });

    describe('getExchangeName', () => {
        it('should return provided exchange name', () => {
            const options = { exchangeName: 'toto' };
            expect(configs.getExchangeName(options)).to.be.eql('toto');
        });

        it('should return amqp default queues if no exchange provided but type is provided', () => {
            const options = { type: EXCHANGE_TYPE.DIRECT };
            expect(configs.getExchangeName(options)).to.be.eql('amq.direct');
        });

        it('should return empty exchange name if no option provided', () => {
            const options = {};
            expect(configs.getExchangeName(options)).to.be.eql('');
        });
    });

    describe('getQueueName', () => {
        it('should set queue name to the routing key when on direct', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.DIRECT, routingKey: 'rkey' });
            expect(queueName).to.be.eql('rkey');
        });

        it('should set queue name to the routing key when on direct', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.DIRECT, routingKey: 'rkey' });
            expect(queueName).to.be.eql('rkey');
        });

        it('should return empty queue name if no routing key is provided on DIRECT', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.DIRECT });
            expect(queueName).to.be.eql('');
        });

        it('should return empty queue name if unable to determine queue name for topic', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.TOPIC }, {});
            expect(queueName).to.be.eql('');
        });

        it('should set queue name to service:queue when on FANOUT', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.FANOUT, queueName: 'tata' }, { serviceName: 'toto' });
            expect(queueName).to.be.eql('toto:tata');
        });

        it('should set queue name to service:queue when on TOPIC', () => {
            const queueName = configs.getQueueName({ type: EXCHANGE_TYPE.TOPIC, queueName: 'tata' }, { serviceName: 'toto' });
            expect(queueName).to.be.eql('toto:tata');
        });
    });
});
