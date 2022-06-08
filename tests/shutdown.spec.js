const makeClient = require('./client');

describe('shutdown', () => {
    it('can happen after connection was closed', async () => {
        const carotte = makeClient();

        carotte.subscribe('hello', () => {});

        await carotte.invoke('hello', {});

        const connection = await carotte.getConnection();

        await connection.close();
        await carotte.shutdown();
    });
});
