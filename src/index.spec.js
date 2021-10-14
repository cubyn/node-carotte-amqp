const { expect } = require('chai');

const Carotte = require('./index');

describe.only('carotte', () => {
    let carotte;

    afterEach(async () => {
        if (carotte) {
            await carotte.shutdown(0, 50);
        }
    });

    it('should initialize carotte', async () => {
        carotte = Carotte({});

        expect(carotte).not.to.be.undefined;
    });

    describe('hooks', () => {
        describe('onReceive', () => {
            it('should override data', async () => {
                carotte = Carotte({
                    plugins: [{
                        onReceive: (next, paramaters) => {
                            paramaters.data.name = `${paramaters.data.name} Doe`;
                            return next(paramaters);
                        }
                    }]
                });

                await carotte.subscribe('lambda:v1', {}, ({ data: { name } }) => {
                    return `Hello ${name}!`;
                });

                const result = await carotte.invoke('lambda:v1', { name: 'John' });

                expect(result).to.be.eq('Hello John Doe!');
            });

            it('should override response', async () => {
                carotte = Carotte({
                    plugins: [{
                        onReceive: (next, paramaters) => `${next(paramaters)} John Doe!`
                    }]
                });

                await carotte.subscribe('lambda:v1', {}, () => 'Hello');

                const result = await carotte.invoke('lambda:v1', {});

                expect(result).to.be.eq('Hello John Doe!');
            });
        });

        describe('onInvoke', () => {
            it('should override data', async () => {
                carotte = Carotte({
                    plugins: [{
                        onInvoke: (next, qualifier, options, payload) => next(`${qualifier}:v1`, options, payload)
                    }]
                });

                await carotte.subscribe('lambda:v1', {}, ({ data: { name } }) => {
                    return `Hello ${name}!`;
                });

                const result = await carotte.invoke('lambda', { name: 'John Doe' });

                expect(result).to.be.eq('Hello John Doe!');
            });

            it('should override response', async () => {
                carotte = Carotte({
                    plugins: [{
                        onInvoke: (next, qualifier, options, payload) => `${next(qualifier, options, payload)} John Doe!`
                    }]
                });

                await carotte.subscribe('lambda:v1', {}, () => 'Hello');

                const result = await carotte.invoke('lambda:v1', {});

                expect(result).to.be.eq('Hello John Doe!');
            });
        });
    });
});
