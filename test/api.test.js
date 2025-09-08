const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('Standalone API Endpoints', () => {
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

    describe('POST /api/get-job-status', () => {
        it('should return job status', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const job = { job_id: 'job-123', status: 'completed' };
            const singleStub = sinon.stub().resolves({ data: job, error: null });
            const eqStub = sinon.stub().returns({ single: singleStub });
            const selectStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('background_jobs').returns({ select: selectStub });

            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer fake-token')
                .send({ jobId: 'job-123' });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, job);
        });

        it('should return 404 if job not found', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const singleStub = sinon.stub().resolves({ data: null, error: { message: 'Not found' } });
            const eqStub = sinon.stub().returns({ single: singleStub });
            fromStub.withArgs('background_jobs').returns({ select: sinon.stub().returns({ eq: eqStub }) });

            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer fake-token')
                .send({ jobId: 'job-123' });

            assert.strictEqual(response.status, 404);
        });

        it('should return 400 if jobId is missing', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer fake-token')
                .send({});
            assert.strictEqual(response.status, 400);
        });
    });

    describe('POST /api/getNotifications', () => {
        it('should return notifications for a user', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const notifications = [{ id: 1, message: 'test' }];
            const orderStub = sinon.stub().resolves({ data: notifications, error: null });
            const eqStub = sinon.stub().returns({ order: orderStub });
            const selectStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('notifications').returns({ select: selectStub });

            const response = await request(app)
                .post('/api/getNotifications')
                .set('Authorization', 'Bearer fake-token');

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, notifications);
        });

        it('should return 500 on database error', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const orderStub = sinon.stub().resolves({ data: null, error: { message: 'DB Error' } });
            const eqStub = sinon.stub().returns({ order: orderStub });
            fromStub.withArgs('notifications').returns({ select: sinon.stub().returns({ eq: eqStub }) });

            const response = await request(app)
                .post('/api/getNotifications')
                .set('Authorization', 'Bearer fake-token');

            assert.strictEqual(response.status, 500);
        });
    });

    describe('POST /api/markNotificationsAsRead', () => {
        it('should mark notifications as read', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const eqStub = sinon.stub().resolves({ error: null });
            const inStub = sinon.stub().returns({ eq: eqStub });
            const updateStub = sinon.stub().returns({ in: inStub });
            fromStub.withArgs('notifications').returns({ update: updateStub });

            const response = await request(app)
                .post('/api/markNotificationsAsRead')
                .set('Authorization', 'Bearer fake-token')
                .send({ notification_ids: [1, 2] });

            assert.strictEqual(response.status, 200);
            assert(inStub.calledWith('id', [1, 2]));
        });

        it('should return 400 for invalid payload', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const response = await request(app)
                .post('/api/markNotificationsAsRead')
                .set('Authorization', 'Bearer fake-token')
                .send({ notification_ids: [] }); // Empty array
            assert.strictEqual(response.status, 400);
        });
    });

    describe('POST /api/get-leaderboard', () => {
        it('should return leaderboard data', async () => {
            authStub.resolves({ data: { user: { id: 'user-123' } }, error: null });
            const settings = { setting_value: { metrics: { courses_completed: true } } };
            const leaderboard = [{ user_id: '123', score: 10 }];
            const singleStub = sinon.stub().resolves({ data: settings, error: null });
            const eqStub = sinon.stub().returns({ single: singleStub });
            const selectStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('leaderboard_settings').returns({ select: selectStub });
            supabaseMock.rpc = sinon.stub().resolves({ data: leaderboard, error: null });

            const response = await request(app)
                .post('/api/get-leaderboard')
                .set('Authorization', 'Bearer fake-token');

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, leaderboard);
        });
    });
});
