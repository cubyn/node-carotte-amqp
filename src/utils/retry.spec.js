const { expect } = require('chai');
const { computeNextCall, incrementRetryHeaders, cleanRetryHeaders } = require('./retry');
const Puid = require('puid');

describe('utils/retry', () => {
    describe('cleanRetryHeaders', () => {
        it('should filter retry headers', () => {
            const baseHeaders = {
                'x-correlation-id': new Puid().generate()
            };
            const headers = Object.assign({}, baseHeaders, {
                'x-retry-max': 100,
                'x-retry-count': 100,
                'x-retry-strategy': 'fixed',
                'x-retry-interval': 100,
                'x-retry-jitter': 10
            });
            expect(cleanRetryHeaders(headers)).to.eql(baseHeaders);
        });
    });

    describe('computeNextCall', () => {
        const cases = [
            [8, { 'x-retry-strategy': 'exponential', 'x-retry-count': 2, 'x-retry-interval': 4 }],
            [0, { 'x-retry-strategy': 'exponential', 'x-retry-count': 2 }],
            [10, { 'x-retry-strategy': 'direct', 'x-retry-count': 0, 'x-retry-interval': 10 }]
        ];
        cases.forEach(([expected, retryHeaders]) => {
            it(`should compute ${expected} with retry headers ${JSON.stringify(retryHeaders)}`, () => {
                expect(computeNextCall(retryHeaders)).to.equal(expected);
            });
        });

        describe('when jitter is defined', () => {
            it('should compute delay with some randomness', () => {
                expect(computeNextCall({ 'x-retry-strategy': 'exponential', 'x-retry-count': 2, 'x-retry-interval': 4, 'x-retry-jitter': 3 })).to.be.greaterThanOrEqual(8).and.to.be.lessThan(11);

                expect(computeNextCall({ 'x-retry-strategy': 'direct', 'x-retry-count': 2, 'x-retry-interval': 10, 'x-retry-jitter': 5 })).to.be.greaterThanOrEqual(10).and.to.be.lessThan(15);
            });
        });
    });

    describe('incrementRetryHeaders', () => {
        it('should set incremented retry headers', () => {
            const options = {
                headers: {}
            };
            const retry = {
                strategy: 'direct',
                max: 2,
                interval: 10
            };
            incrementRetryHeaders(options, retry);
            expect(options).to.deep.eql({
                headers: {
                    'x-retry-max': '2',
                    'x-retry-strategy': 'direct',
                    'x-retry-interval': '10',
                    'x-retry-count': '1'
                }
            });

            incrementRetryHeaders(options, retry);
            expect(options).to.deep.eql({
                headers: {
                    'x-retry-max': '2',
                    'x-retry-strategy': 'direct',
                    'x-retry-interval': '10',
                    'x-retry-count': '2'
                }
            });
        });

        describe('when jitter is defined', () => {
            it('should set incremented retry headers', () => {
                const options = {
                    headers: {}
                };
                const retry = {
                    strategy: 'direct',
                    max: 2,
                    interval: 10,
                    jitter: 4
                };
                incrementRetryHeaders(options, retry);
                expect(options).to.deep.eql({
                    headers: {
                        'x-retry-max': '2',
                        'x-retry-strategy': 'direct',
                        'x-retry-interval': '10',
                        'x-retry-count': '1',
                        'x-retry-jitter': '4'
                    }
                });
            });
        });
    });
});
