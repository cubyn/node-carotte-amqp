const { expect } = require('chai');

const { getHooks } = require('./plugins');

describe('plugins', () => {
    describe('getHooks', () => {
        it('should create hooks based on plugins', () => {
            const hooks = getHooks([
                { onInvoke: (next) => 2 * next() + 1 }
            ]);

            const handler = () => 10;
            expect(hooks.onInvoke(handler)()).to.be.eq(21);
        });

        it('should execute plugins in the same order as the array', () => {
            const hooks = getHooks([
                { onInvoke: (next) => `1${next()}5` },
                { onInvoke: (next) => `2${next()}4` }
            ]);

            const handler = () => '3';
            expect(hooks.onInvoke(handler)()).to.be.eq('12345');
        });

        it('should allow to override arguments', () => {
            const hooks = getHooks([
                { onInvoke: (next, value) => next(value * 3) },
                { onInvoke: (next, value) => next(value) * 2 }
            ]);

            const handler = (value) => value + 1;

            expect(hooks.onInvoke(handler)(10)).to.be.eq(62);
        });

        it('should allow to override arguments', () => {
            const hooks = getHooks([
                { onInvoke: (next, value) => next(value * 3) },
                { onInvoke: (next, value) => next(value) * 2 }
            ]);

            const handler = (value) => value + 1;

            expect(hooks.onInvoke(handler)(10)).to.be.eq(62);
        });

        it('should ignored not allowed hooks', () => {
            const hooks = getHooks([
                { onNotAllowed: (next, value) => next(value) }
            ]);

            expect(hooks.onNotAllowed).to.be.undefined;
        });

        it('should defined all allowed hooks', () => {
            const hooks = getHooks([]);

            expect(hooks.onInvoke).not.to.be.undefined;
            expect(hooks.onPublish).not.to.be.undefined;
            expect(hooks.onReceive).not.to.be.undefined;
        });

        it('should have a default plugins parameter', () => {
            const hooks = getHooks();

            expect(hooks.onInvoke).not.to.be.undefined;
            expect(hooks.onPublish).not.to.be.undefined;
            expect(hooks.onReceive).not.to.be.undefined;

            const handler = (value) => value + 1;

            expect(hooks.onInvoke(handler)(10)).to.be.eq(11);
        });
    });
});

