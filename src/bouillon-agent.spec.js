const expect = require('chai').expect;
const bouillonAgent = require('./bouillon-agent');


describe('bouillon agent spec', () => {
    describe('addSubscriber', () => {
        it('should append default properties to subscriber object', () => {
            expect(bouillonAgent.getSubscriber('toto')).to.be.undefined;
            bouillonAgent.addSubscriber('toto', {});

            const subscriber = bouillonAgent.getSubscriber('toto');

            expect(subscriber.qualifier).to.be.eql('toto');
            expect(subscriber.performances).to.be.defined;
            expect(subscriber.performances.duration).to.be.defined;
            expect(subscriber.performances.duration.min).to.be.eql(0);
            expect(subscriber.performances.duration.max).to.be.eql(0);
            expect(subscriber.performances.duration.sum).to.be.eql(0);
            expect(subscriber.receivedCount).to.be.eql(0);
            expect(subscriber.firstReceivedAt.getTime()).to.be.eql(new Date(0).getTime());
            expect(subscriber.lastReceivedAt.getTime()).to.be.eql(new Date(0).getTime());
            expect(subscriber.callers).to.be.defined;
        });
    });


    describe('getSubscriber', () => {
        it('should return a stored subscriber object', () => {
            expect(bouillonAgent.getSubscriber('tata')).to.be.undefined;
            bouillonAgent.addSubscriber('tata', {});

            const subscriber = bouillonAgent.getSubscriber('tata');

            expect(subscriber.qualifier).to.be.eql('tata');
        });
    });

    describe('logStats', () => {
        it('should do nothing if no service is present in subscriber list', () => {
            bouillonAgent.logStats('titi', 1, 'caller');

            const subscriber = bouillonAgent.getSubscriber('titi');
            expect(subscriber).to.be.undefined;
        });

        it('should update stats for a subscriber when called', () => {
            bouillonAgent.addSubscriber('logStats-test', {});
            bouillonAgent.logStats('logStats-test', 1, 'caller');


            const subscriber = bouillonAgent.getSubscriber('logStats-test');

            expect(subscriber.performances.duration.sum).to.be.eql(1);
            expect(subscriber.receivedCount).to.be.eql(1);
            expect(subscriber.callers).to.include('caller');
            expect(subscriber.firstReceivedAt).to.be.gt(new Date(0));
            expect(subscriber.lastReceivedAt).to.be.gt(new Date(0));
        });

        it('should update the min/max execution time', () => {
            bouillonAgent.addSubscriber('logStats-test-2', {});
            bouillonAgent.logStats('logStats-test-2', 5, 'caller');
            bouillonAgent.logStats('logStats-test-2', 3, 'caller');
            bouillonAgent.logStats('logStats-test-2', 2, 'caller');
            bouillonAgent.logStats('logStats-test-2', 1, 'caller');
            bouillonAgent.logStats('logStats-test-2', 3, 'caller');

            const subscriber = bouillonAgent.getSubscriber('logStats-test-2');

            expect(subscriber.performances.duration.min).to.be.eql(1);
            expect(subscriber.performances.duration.max).to.be.eql(5);
        });
    });
});
