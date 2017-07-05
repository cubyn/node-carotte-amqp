const expect = require('chai').expect;
const packageJson = require('../package.json');
const carotte = require('./client')({
    autoDescribe: false
});

describe('describe', () => {
    it('should get x-origin-consumer when called from a subscriber', async () => {
        await carotte.subscribe(
            'subscriber-header-test-1',
            { queue: { exclusive: true } },
            ({ invoke }) => {
                return invoke('subscriber-header-test-2', {});
            });

        await carotte.subscribe(
            'subscriber-header-test-2',
            { queue: { exclusive: true } },
            ({ headers }) => {
                return headers['x-origin-consumer'];
            });

        return carotte.invoke('subscriber-header-test-1', {})
            .then((data) => {
                expect(data).to.eql('subscriber-header-test-1');
            });
    });

    it('should get x-origin-service set to service name when called directly', async () => {
        await carotte.subscribe(
            'subscriber-header-test-3',
            { queue: { exclusive: true } },
            ({ headers }) => {
                return headers['x-origin-service'];
            });

        return carotte.invoke('subscriber-header-test-3', {})
            .then((data) => {
                expect(data).to.eql(packageJson.name);
            });
    });
});
