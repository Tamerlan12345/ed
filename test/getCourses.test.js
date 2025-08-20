const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('getCourses Handler', () => {
    let handler;
    let supabaseMock;

    beforeEach(() => {
        // Set up the mock for the supabase client
        const fromStub = sinon.stub();
        const authStub = {
            getUser: sinon.stub()
        };

        // Default successful stubs
        authStub.getUser.resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null });
        fromStub.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [{ course_id: 'test1', title: 'Test Course 1' }], error: null })
        });
        fromStub.withArgs('user_progress').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [{ course_id: 'test1' }], error: null })
        });

        supabaseMock = {
            from: fromStub,
            auth: authStub
        };

        // Use proxyquire to load the handler with our mocked dependency
        const module = proxyquire('../netlify/functions/getCourses.js', {
            '@supabase/supabase-js': {
                createClient: () => supabaseMock
            }
        });
        handler = module.handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return courses and user progress for an authorized user', async () => {
        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(body.courses, [{ id: 'test1', title: 'Test Course 1' }]);
        assert.deepStrictEqual(body.userProgress, { 'test1': { completed: true } });
    });

    it('should return 500 if user is not authorized', async () => {
        // Override the default successful stub for this test
        supabaseMock.auth.getUser.resolves({ data: { user: null }, error: new Error('Unauthorized') });

        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 500);
        assert.strictEqual(body.error, 'Unauthorized');
    });

    it('should return 500 if fetching courses fails', async () => {
        // Override the default successful stub for this test
        supabaseMock.from.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: null, error: new Error('DB Error') })
        });

        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 500);
        assert.strictEqual(body.error, 'DB Error');
    });
});
