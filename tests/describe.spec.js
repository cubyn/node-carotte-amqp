const expect = require('chai').expect;
const carotte = require('./client')({
    autoDescribe: true
});

describe('describe', () => {
    it('should expose metas on a direct route using a :describe:v2 suffix', () => {
        carotte.subscribe('hello-to-you-describe!', { queue: { exclusive: true } }, () => {}, {
            meta: 'cyborg'
        });

        return carotte.invoke('hello-to-you-describe!:describe:v2', {})
            .then(data => {
                expect(data.meta).to.be.a('string');
                expect(data.meta).to.eql('cyborg');
            });
    });

    it('should expose metas on a topic route using a :describe:v2 suffix on a direct route', () => {
        carotte.subscribe('topic/hello-to-you-describe!', { queue: { exclusive: true } }, () => {
            throw new Error('Das is not gut!');
        }, {
            meta: 'cyborg'
        });

        return carotte.invoke('hello-to-you-describe!:describe:v2', {})
            .then(data => {
                expect(data.meta).to.be.a('string');
                expect(data.meta).to.be.eql('cyborg');
            });
    });
});
