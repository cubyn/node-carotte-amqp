const expect = require('chai').expect;
const carotte = require('./client')({
    autoDescribe: true
});

describe('describe', () => {
    it('should expose metas on a direct route using a :describe suffix', () => {
        carotte.subscribe('hello-to-you-describe!', { queue: { exclusive: true } }, () => {}, {
            meta: 'cyborg'
        });

        return carotte.invoke('hello-to-you-describe!:describe', {})
            .then(data => {
                expect(data.meta).to.be.defined;
                expect(data.meta).to.eql('cyborg');
            });
    });

    it('should expose metas on a topic route using a :describe suffix on a direct route', (done) => {
        carotte.subscribe('topic/hello-to-you-describe!', { queue: { exclusive: true } }, () => {
            done(new Error('Das is not gut!'));
        }, {
            meta: 'cyborg'
        });

        carotte.invoke('hello-to-you-describe!:describe', {})
            .then(data => {
                expect(data.meta).to.be.defined;
                expect(data.meta).to.be.eql('cyborg');
            })
            .then(done);
    });
});
