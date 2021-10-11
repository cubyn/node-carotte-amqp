const { expect } = require('chai');
const autodocAgent = require('./autodoc-agent');

describe('autodoc agent spec', () => {
  describe('addSubscriber', () => {
    it('should append default properties to subscriber object', () => {
      expect(autodocAgent.getSubscriber('toto')).to.be.undefined;
      autodocAgent.addSubscriber('toto', {});

      const subscriber = autodocAgent.getSubscriber('toto');

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
      expect(autodocAgent.getSubscriber('tata')).to.be.undefined;
      autodocAgent.addSubscriber('tata', {});

      const subscriber = autodocAgent.getSubscriber('tata');

      expect(subscriber.qualifier).to.be.eql('tata');
    });
  });

  describe('logStats', () => {
    it('should do nothing if no service is present in subscriber list', () => {
      autodocAgent.logStats('titi', 1, 'caller');

      const subscriber = autodocAgent.getSubscriber('titi');
      expect(subscriber).to.be.undefined;
    });

    it('should update stats for a subscriber when called', () => {
      autodocAgent.addSubscriber('logStats-test', {});
      autodocAgent.logStats('logStats-test', 1, 'caller');

      const subscriber = autodocAgent.getSubscriber('logStats-test');

      expect(subscriber.performances.duration.sum).to.be.eql(1);
      expect(subscriber.receivedCount).to.be.eql(1);
      expect(subscriber.callers).to.include('caller');
      expect(subscriber.firstReceivedAt).to.be.gt(new Date(0));
      expect(subscriber.lastReceivedAt).to.be.gt(new Date(0));
    });

    it('should update the min/max execution time', () => {
      autodocAgent.addSubscriber('logStats-test-2', {});
      autodocAgent.logStats('logStats-test-2', 5, 'caller');
      autodocAgent.logStats('logStats-test-2', 3, 'caller');
      autodocAgent.logStats('logStats-test-2', 2, 'caller');
      autodocAgent.logStats('logStats-test-2', 1, 'caller');
      autodocAgent.logStats('logStats-test-2', 3, 'caller');

      const subscriber = autodocAgent.getSubscriber('logStats-test-2');

      expect(subscriber.performances.duration.min).to.be.eql(1);
      expect(subscriber.performances.duration.max).to.be.eql(5);
    });
  });
});
