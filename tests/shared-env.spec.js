const expect = require('chai').expect;
const carotte = require('./client')();
const configs = require('../src/configs');

describe('shared env', () => {
    const initialConfigToken = configs.debugToken;

    afterEach(() => {
        configs.debugToken = initialConfigToken;
    });

    it('should be able to communicate with overloaded service', async () => {
        await carotte.subscribe('direct/random-queue-aihie', { queue: { exclusive: true } }, ({ data }) => {
            return 3;
        });

        await carotte.subscribe('direct/random-queue-aihie', { queue: { exclusive: true } }, ({ data }) => {
            return 2;
        });

        configs.debugToken = 'I can do it';

        await carotte.subscribe('direct/random-queue-aihie', { queue: { exclusive: true } }, ({ data }) => {
            return 4;
        });

        return carotte.invoke('direct/random-queue-aihie', {})
            .then(data => {
                expect(data).to.eql(4);
            });
    });


    it('should be able to propagate debug token accross calls', async () => {
        // this will be our regular service, not using tokens
        await carotte.subscribe('direct/random-queue-helper', { queue: { exclusive: true } }, ({ data, invoke }) => {
            // reset env token to simulate remote config
            configs.debugToken = '';
            return invoke('final-dest', {});
        });

        // this will be our regular service, another lambda
        await carotte.subscribe('direct/final-dest', { queue: { exclusive: true } }, ({ data }) => {
            // this should never been called as overloaded by the one below
            return 'remote-final';
        });

        // this will be our overloaded queue on dev computer
        await carotte.subscribe('direct/final-dest:token', { queue: { exclusive: true } }, ({ data }) => {
            // local dev reached! yay!
            return 'local-final';
        });

        // a remote queue, non-debug
        await carotte.subscribe('direct/random-queue-xxaxa', { queue: { exclusive: true } }, ({ data }) => {
            // should never be called
            return 'not good';
        });

        // a remote queue, non debug
        await carotte.subscribe('direct/random-queue-xxaxa', { queue: { exclusive: true } }, ({ data }) => {
            // should never be called
            return 'not good';
        });

        // simulate env token
        configs.debugToken = 'token';

        // local dev queue firstly called
        await carotte.subscribe('direct/random-queue-xxaxa', { queue: { exclusive: true } }, ({ data, invoke }) => {
            // local dev queue call remote queue
            return invoke('random-queue-helper', {});
        });

        return carotte.invoke('direct/random-queue-xxaxa', {})
            .then(data => {
                expect(data).to.eql('local-final');
            });
    });
});
