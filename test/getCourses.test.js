const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('getCourses Handler', () => {
    let handler;
    let supabaseMock;
    let handleErrorMock;

    beforeEach(() => {
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"An internal server error occurred. Please try again later."}' });

        const fromStub = sinon.stub();
        const authStub = {
            getUser: sinon.stub().resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null })
        };

        fromStub.withArgs('user_profiles').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: { department: 'Sales' }, error: null })
        });

        fromStub.withArgs('courses').returns({
            select: sinon.stub().resolves({ data: [{ course_id: 'test1', title: 'Test Course 1', status: 'published' }], error: null })
        });

        fromStub.withArgs('group_assignments').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [], error: null })
        });

        fromStub.withArgs('user_progress').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: [{ course_id: 'test1', percentage: 100, attempts: 1 }], error: null })
        });

        supabaseMock = {
            from: fromStub,
            auth: authStub,
        };

        const createClientMock = sinon.stub().returns(supabaseMock);

        handler = proxyquire('../netlify/functions/getCourses.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            './utils/errors': { handleError: handleErrorMock },
        }).handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return courses and user progress for an authorized user', async () => {
        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        const response = await handler(event);

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        const expectedCourses = [{ id: 'test1', title: 'Test Course 1', isAssigned: true }];
        const expectedProgress = { 'test1': { completed: true, percentage: 100, attempts: 1 } };
        assert.deepStrictEqual(body.courses, expectedCourses);
        assert.deepStrictEqual(body.userProgress, expectedProgress);
    });

    it('should return 500 if user is not authorized', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: null }, error: new Error('Unauthorized') });
        const event = { headers: { authorization: 'Bearer FAKE_TOKEN' } };
        await handler(event);
        assert(handleErrorMock.calledOnce);
    });

});
