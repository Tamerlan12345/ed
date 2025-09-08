const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('Admin: Upload and Process File (Background)', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let cryptoMock;
    let cronMock;
    let handleUploadAndProcessMock;

    beforeEach(() => {
        supabaseMock = {
            from: sinon.stub().returnsThis(),
            insert: sinon.stub().resolves({ error: null }),
            auth: {
                getUser: sinon.stub(),
            },
        };

        createClientMock = sinon.stub().returns(supabaseMock);

        authStub = supabaseMock.auth.getUser.resolves({
            data: { user: { id: 'user-123' } },
            error: null,
        });

        cryptoMock = {
            randomUUID: sinon.stub().returns('mock-uuid-123'),
        };

        cronMock = {
            schedule: sinon.stub(),
        };

        // This is a "fire-and-forget" function, so we mock it to prevent it from running.
        // In the original server/index.js, this function is defined in the same scope
        // as the route handler, so we can't easily mock it with proxyquire.
        // This is a limitation of the current monolithic structure.
        // For now, we will assume it's called and test the synchronous part.
        // A better solution would be to refactor handleUploadAndProcess into its own module.
        handleUploadAndProcessMock = sinon.stub();


        app = proxyquire('../../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'crypto': cryptoMock,
            'node-cron': cronMock,
            // We can't mock handleUploadAndProcess directly this way as it's not a module
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    const validPayload = {
        action: 'upload_and_process',
        course_id: 'test-course',
        title: 'Test Course',
        file_name: 'test.docx',
        file_data: 'aGVsbG8=', // "hello" in base64
    };

    it('should return 202 Accepted and a jobId on valid request', async () => {
        const response = await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send(validPayload);

        assert.strictEqual(response.status, 202);
        assert.deepStrictEqual(response.body, { jobId: 'mock-uuid-123' });
    });

    it('should create a job entry in the database', async () => {
        await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send(validPayload);

        assert(supabaseMock.from.calledWith('background_jobs'));
        assert(supabaseMock.insert.calledOnce);
        const insertedData = supabaseMock.insert.firstCall.args[0];
        assert.deepStrictEqual(insertedData, {
            job_id: 'mock-uuid-123',
            job_type: 'file_upload',
            status: 'pending',
            created_by: 'user-123',
            related_entity_id: 'test-course'
        });
    });

    it('should return 500 if creating the initial job entry fails', async () => {
        const dbError = { message: 'Insert failed' };
        supabaseMock.insert.resolves({ error: dbError });

        const response = await request(app)
            .post('/api/admin')
            .set('Authorization', 'Bearer fake-token')
            .send(validPayload);

        assert.strictEqual(response.status, 500);
        assert.deepStrictEqual(response.body, {
            error: 'An internal server error occurred.',
            errorMessage: 'Insert failed',
        });
    });
});
