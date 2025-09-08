const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('getCourses Handler', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let cronMock;
    let fromStub;

    beforeEach(() => {
        fromStub = sinon.stub();
        authStub = sinon.stub();

        supabaseMock = {
            from: fromStub,
            auth: {
                getUser: authStub,
            },
        };

        createClientMock = sinon.stub().returns(supabaseMock);

        cronMock = {
            schedule: sinon.stub(),
        };

        app = proxyquire('../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'node-cron': cronMock,
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return courses and user progress for an authorized user', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        const courses = [{ course_id: 'test1', title: 'Test Course 1', status: 'published' }];
        const progress = [{ course_id: 'test1', percentage: 100, attempts: 1 }];

        fromStub.withArgs('courses').returns({
            select: sinon.stub().resolves({ data: courses, error: null }),
        });
        fromStub.withArgs('user_progress').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ data: progress, error: null }),
        });

        const response = await request(app)
            .post('/api/getCourses')
            .set('Authorization', 'Bearer FAKE_TOKEN');

        assert.strictEqual(response.status, 200);
        const expectedCourses = [{ id: 'test1', title: 'Test Course 1', isAssigned: true }];
        const expectedProgress = { 'test1': { completed: true, percentage: 100, attempts: 1 } };
        assert.deepStrictEqual(response.body.courses, expectedCourses);
        assert.deepStrictEqual(response.body.userProgress, expectedProgress);
    });

    it('should return 401 if user is not authorized', async () => {
        authStub.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });

        const response = await request(app)
            .post('/api/getCourses')
            .set('Authorization', 'Bearer FAKE_TOKEN');

        assert.strictEqual(response.status, 401);
        assert.deepStrictEqual(response.body, { error: 'Unauthorized' });
    });

    it('should return 500 if there is a database error', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        fromStub.withArgs('courses').returns({
            select: sinon.stub().resolves({ data: null, error: { message: 'DB Error' } }),
        });

        const response = await request(app)
            .post('/api/getCourses')
            .set('Authorization', 'Bearer FAKE_TOKEN');

        assert.strictEqual(response.status, 500);
        assert.deepStrictEqual(response.body, { error: 'Internal Server Error' });
    });
});
