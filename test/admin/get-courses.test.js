const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('Admin: Get Courses', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let cronMock;

    beforeEach(() => {
        // Mock the supabase client's methods
        supabaseMock = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub(),
            auth: {
                getUser: sinon.stub(),
            },
        };

        // Mock the createClient function to return our mock
        createClientMock = sinon.stub().returns(supabaseMock);

        // Stub the auth process to simulate a successful login
        authStub = supabaseMock.auth.getUser.resolves({
            data: { user: { id: 'user-id-123', email: 'admin@example.com' } },
            error: null,
        });

        // Mock node-cron to prevent it from running in tests
        cronMock = {
            schedule: sinon.stub(),
        };

        // Use proxyquire to load the server with our mocked dependencies
        app = proxyquire('../../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'node-cron': cronMock,
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return 200 with courses from the database', async () => {
        const courses = [{ id: 1, title: 'Test Course' }];
        supabaseMock.select.resolves({ data: courses, error: null });

        const response = await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send({ action: 'get_courses_admin' });

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, courses);
        assert(supabaseMock.from.calledWith('courses'));
        assert(supabaseMock.select.calledWith('*'));
    });

    it('should return 500 on database error', async () => {
        const dbError = { message: 'Database error' };
        supabaseMock.select.resolves({ data: null, error: dbError });

        const response = await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send({ action: 'get_courses_admin' });

        assert.strictEqual(response.status, 500);
        assert.deepStrictEqual(response.body, {
            error: 'An internal server error occurred.',
            errorMessage: 'Database error',
        });
    });

    it('should return 401 if auth fails', async () => {
        // Override the successful auth stub for this test
        authStub.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });

        const response = await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send({ action: 'get_courses_admin' });

        assert.strictEqual(response.status, 401);
        assert.deepStrictEqual(response.body, { error: 'Unauthorized' });
    });

    it('should return 401 if no auth header is present', async () => {
        const response = await request(app)
            .post('/api/admin')
            .send({ action: 'get_courses_admin' });

        assert.strictEqual(response.status, 401);
        assert.deepStrictEqual(response.body, { error: 'Authorization header is missing.' });
    });
});
