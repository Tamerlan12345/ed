const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('saveTestResult Handler', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let fromStub;
    let cronMock;

    beforeEach(() => {
        authStub = sinon.stub();
        fromStub = sinon.stub();
        cronMock = { schedule: sinon.stub() };

        supabaseMock = {
            from: fromStub,
            auth: {
                getUser: authStub,
            },
        };

        createClientMock = sinon.stub().returns(supabaseMock);

        app = proxyquire('../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'node-cron': cronMock,
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    const validPayload = {
        course_id: 'test-course',
        score: 10,
        total_questions: 10,
        percentage: 100,
    };

    it('should save a new test result', async () => {
        authStub.resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null });
        const selectStub = sinon.stub().returns({
            eq: sinon.stub().returnsThis(),
            maybeSingle: sinon.stub().resolves({ data: null, error: null }),
        });
        const insertStub = sinon.stub().resolves({ error: null });
        fromStub.withArgs('user_progress').returns({
            select: selectStub,
            insert: insertStub,
        });

        const response = await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send(validPayload);

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, { message: 'Результат успешно сохранен' });
        assert(insertStub.calledOnce);
    });

    it('should update an existing test result', async () => {
        authStub.resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null });
        const existingRecord = { id: 1, attempts: 1 };
        const selectStub = sinon.stub().returns({
            eq: sinon.stub().returnsThis(),
            maybeSingle: sinon.stub().resolves({ data: existingRecord, error: null }),
        });
        const updateStub = sinon.stub().returns({
            eq: sinon.stub().resolves({ error: null }),
        });
        fromStub.withArgs('user_progress').returns({
            select: selectStub,
            update: updateStub,
        });

        const response = await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send(validPayload);

        assert.strictEqual(response.status, 200);
        assert(updateStub.calledOnce);
        const updateData = updateStub.firstCall.args[0];
        assert.strictEqual(updateData.attempts, 2);
    });

    it('should return 400 for missing fields', async () => {
        authStub.resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null });
        const response = await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: 'test-course' }); // Missing other fields

        assert.strictEqual(response.status, 400);
        assert.deepStrictEqual(response.body, { error: 'Missing required fields.' });
    });

    it('should return 401 for unauthorized user', async () => {
        authStub.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });

        const response = await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send(validPayload);

        assert.strictEqual(response.status, 401);
    });

    it('should return 500 on database error', async () => {
        authStub.resolves({ data: { user: { id: '123', email: 'test@test.com' } }, error: null });
        const selectStub = sinon.stub().returns({
            eq: sinon.stub().returnsThis(),
            maybeSingle: sinon.stub().resolves({ data: null, error: { message: 'DB Error' } }),
        });
        fromStub.withArgs('user_progress').returns({
            select: selectStub,
        });

        const response = await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send(validPayload);

        assert.strictEqual(response.status, 500);
    });
});
