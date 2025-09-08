const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('Admin Handler - New Tests', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let rpcStub;
    let fromStub;
    let cronMock;

    beforeEach(() => {
        authStub = sinon.stub();
        rpcStub = sinon.stub();
        fromStub = sinon.stub();
        cronMock = { schedule: sinon.stub() };

        supabaseMock = {
            from: fromStub,
            rpc: rpcStub,
            auth: {
                getUser: authStub,
            },
        };

        createClientMock = sinon.stub().returns(supabaseMock);

        app = proxyquire('../../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'node-cron': cronMock,
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("Action: get_all_users", () => {
        it('should return all users from the database', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const users = [{ id: 1, name: 'Test User' }];
            rpcStub.withArgs('get_all_users_with_profiles').resolves({ data: users, error: null });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'get_all_users' });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, users);
            assert(rpcStub.calledWith('get_all_users_with_profiles'));
        });

        it('should return 500 on rpc error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            rpcStub.withArgs('get_all_users_with_profiles').resolves({ data: null, error: { message: 'RPC Error' } });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'get_all_users' });

            assert.strictEqual(response.status, 500);
        });
    });

    describe("Action: get_course_details", () => {
        it('should return course details', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const courseDetails = { course_id: 'test-course', title: 'Test Course' };
            const singleStub = sinon.stub().resolves({ data: courseDetails, error: null });
            const eqStub = sinon.stub().returns({ single: singleStub });
            const selectStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('courses').returns({ select: selectStub });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'get_course_details', course_id: 'test-course' });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, courseDetails);
            assert(fromStub.calledWith('courses'));
            assert(selectStub.calledWith('*, course_materials(*)'));
            assert(eqStub.calledWith('course_id', 'test-course'));
        });

        it('should return 500 on database error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const singleStub = sinon.stub().resolves({ data: null, error: { message: 'DB Error' } });
            const eqStub = sinon.stub().returns({ single: singleStub });
            fromStub.withArgs('courses').returns({ select: sinon.stub().returns({ eq: eqStub }) });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'get_course_details', course_id: 'test-course' });

            assert.strictEqual(response.status, 500);
        });
    });

    describe("Action: publish_course", () => {
        it('should publish a course', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const eqStub = sinon.stub().resolves({ error: null });
            const updateStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('courses').returns({ update: updateStub });

            const payload = {
                action: 'publish_course',
                course_id: 'test-course',
                content_html: '<html></html>',
                questions: [],
                admin_prompt: 'prompt'
            };

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send(payload);

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, { message: 'Course test-course successfully published.' });
            assert(fromStub.calledWith('courses'));
            assert(eqStub.calledWith('course_id', 'test-course'));
            const updateCall = updateStub.firstCall.args[0];
            assert.deepStrictEqual(updateCall.content_html, { summary: '<html></html>', questions: [], admin_prompt: 'prompt' });
            assert.strictEqual(updateCall.status, 'published');
        });

        it('should return 500 on database error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const eqStub = sinon.stub().resolves({ error: { message: 'DB Error' } });
            const updateStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('courses').returns({ update: updateStub });

            const payload = {
                action: 'publish_course',
                course_id: 'test-course',
                content_html: '<html></html>',
                questions: [],
                admin_prompt: 'prompt'
            };

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send(payload);

            assert.strictEqual(response.status, 500);
        });
    });

    describe("Action: delete_course", () => {
        it('should delete a course and its progress', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const eqStub = sinon.stub().resolves({ error: null });
            const deleteStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('user_progress').returns({ delete: deleteStub });
            fromStub.withArgs('courses').returns({ delete: deleteStub });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'delete_course', course_id: 'test-course' });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, { message: 'Course test-course and all related progress have been successfully deleted.' });
            assert(fromStub.calledWith('user_progress'));
            assert(fromStub.calledWith('courses'));
            assert(deleteStub.calledTwice);
        });

        it('should return 400 if course_id is missing', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'delete_course' });
            assert.strictEqual(response.status, 400);
        });

        it('should return 500 on database error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const eqStub = sinon.stub().resolves({ error: { message: 'DB Error' } });
            const deleteStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('user_progress').returns({ delete: deleteStub });
            fromStub.withArgs('courses').returns({ delete: deleteStub });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'delete_course', course_id: 'test-course' });

            assert.strictEqual(response.status, 500);
        });
    });

    describe("Action: text_to_speech", () => {
        let axiosMock;

        beforeEach(() => {
            process.env.VOICERSS_API_KEY = 'test-key';
            axiosMock = {
                get: sinon.stub(),
            };
            app = proxyquire('../../server/index.js', {
                '@supabase/supabase-js': { createClient: createClientMock },
                'node-cron': cronMock,
                'axios': axiosMock,
            });
        });

        it('should return audio data', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            axiosMock.get.resolves({ data: 'fake_audio_data' });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'text_to_speech', text: 'hello' });

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, { audioUrl: 'fake_audio_data' });
        });

        it('should return 400 if text is missing', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'text_to_speech' });
            assert.strictEqual(response.status, 400);
        });

        it('should return 500 on axios error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            axiosMock.get.rejects(new Error('Axios Error'));
            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'text_to_speech', text: 'hello' });
            assert.strictEqual(response.status, 500);
        });
    });

    describe("Action: generate_content", () => {
        let cryptoMock;
        beforeEach(() => {
            cryptoMock = {
                randomUUID: sinon.stub().returns('mock-uuid-456'),
            };
            app = proxyquire('../../server/index.js', {
                '@supabase/supabase-js': { createClient: createClientMock },
                'node-cron': cronMock,
                'crypto': cryptoMock,
            });
        });

        it('should return 202 and a job id', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const insertStub = sinon.stub().resolves({ error: null });
            fromStub.withArgs('background_jobs').returns({ insert: insertStub });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'generate_content', course_id: 'test-course' });

            assert.strictEqual(response.status, 202);
            assert(response.body.jobId);
            assert(fromStub.calledWith('background_jobs'));
            assert(insertStub.calledOnce);
        });

        it('should return 500 on database error', async () => {
            authStub.resolves({ data: { user: { id: 'admin-user' } }, error: null });
            const insertStub = sinon.stub().resolves({ error: { message: 'DB Error' } });
            fromStub.withArgs('background_jobs').returns({ insert: insertStub });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer fake-token')
                .send({ action: 'generate_content', course_id: 'test-course' });

            assert.strictEqual(response.status, 500);
        });
    });
});
