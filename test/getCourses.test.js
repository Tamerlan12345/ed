const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('getCourses Handler', () => {
    let handler;
    let supabaseMock;
    let fromStub;

    beforeEach(() => {
        fromStub = sinon.stub();
        const authStub = {
            getUser: sinon.stub().resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null })
        };

        // Mock for user_profiles
        fromStub.withArgs('user_profiles').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: { department: 'Sales' }, error: null })
        });

        // Mock for courses
        fromStub.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [{ course_id: 'test1', title: 'Test Course 1', product_line: 'General' }], error: null }),
            in: sinon.stub().resolves({ data: [], error: null }) // Default for missing courses
        });

        // Mock for group_assignments
        fromStub.withArgs('group_assignments').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [], error: null }) // Default to no group assignments
        });

        // Mock for user_progress
        fromStub.withArgs('user_progress').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [{ course_id: 'test1', percentage: 100, attempts: 1 }], error: null })
        });

        supabaseMock = {
            from: fromStub,
            auth: authStub,
            // Add storage mock for other tests that might need it, though not this one
            storage: { from: sinon.stub().returns({ getPublicUrl: sinon.stub() }) }
        };

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

        assert.strictEqual(response.statusCode, 200, `Expected 200 but got ${response.statusCode}. Body: ${response.body}`);
        const body = JSON.parse(response.body);

        const expectedCourses = [{ id: 'test1', title: 'Test Course 1', product_line: 'General', isAssigned: true }];
        const expectedProgress = { 'test1': { completed: true, percentage: 100, attempts: 1 } };

        assert.deepStrictEqual(body.courses, expectedCourses);
        assert.deepStrictEqual(body.userProgress, expectedProgress);
    });

    it('should return 500 if user is not authorized', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: null }, error: new Error('Unauthorized') });

        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 500);
        assert.strictEqual(body.error, 'Unauthorized');
    });

    it('should return 500 if fetching user_profiles fails', async () => {
        // Now we need to test failure for the first new call
        fromStub.withArgs('user_profiles').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: null, error: new Error('DB Error') })
        });

        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 500);
        assert.strictEqual(body.error, 'DB Error');
    });
});
