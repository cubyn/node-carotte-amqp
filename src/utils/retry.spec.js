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
                'x-retry-interval': 100
            });
            expect(cleanRetryHeaders(headers)).to.eql(baseHeaders);
        });
    });

    describe('computeNextCall', () => {
        const cases = [
            [8, { 'x-retry-strategy': 'exponential', 'x-retry-count': 2, 'x-retry-interval': 4 }],
            [0, { 'x-retry-strategy': 'exponential', 'x-retry-count': 2 }]
        ];
        cases.forEach(([expected, retryHeaders]) => {
            it(`should compute ${expected} with retry headers ${JSON.stringify(retryHeaders)}`, () => {
                expect(computeNextCall(retryHeaders)).to.equal(expected);
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
    });
});
