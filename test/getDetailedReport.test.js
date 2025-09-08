const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('getDetailedReport Handler', () => {
    let app;
    let supabaseMock;
    let createClientMock;
    let authStub;
    let rpcStub;
    let cronMock;

    beforeEach(() => {
        authStub = sinon.stub();
        rpcStub = sinon.stub();

        supabaseMock = {
            rpc: rpcStub,
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

    it('should return a report with no filters', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        const reportData = [{ user_email: 'test@example.com', percentage: 100 }];
        rpcStub.withArgs('get_detailed_report_data', sinon.match.any).resolves({ data: reportData, error: null });

        const response = await request(app)
            .post('/api/getDetailedReport')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({});

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, reportData);
    });

    it('should call the RPC with correct filters', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        rpcStub.withArgs('get_detailed_report_data', sinon.match.any).resolves({ data: [], error: null });

        const filters = {
            user_email: 'test@test.com',
            department: 'Sales',
            course_id: 'course-123'
        };

        await request(app)
            .post('/api/getDetailedReport')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send(filters);

        assert(rpcStub.calledOnce);
        const expectedRPCParams = {
            user_email_filter: 'test@test.com',
            department_filter: 'Sales',
            course_id_filter: 'course-123'
        };
        assert.deepStrictEqual(rpcStub.firstCall.args[1], expectedRPCParams);
    });

    it('should return 401 if user is not authorized', async () => {
        authStub.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });

        const response = await request(app)
            .post('/api/getDetailedReport')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({});

        assert.strictEqual(response.status, 401);
    });

    it('should return 500 on RPC error', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        rpcStub.withArgs('get_detailed_report_data', sinon.match.any).resolves({ data: null, error: { message: 'RPC Error' } });

        const response = await request(app)
            .post('/api/getDetailedReport')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({});

        assert.strictEqual(response.status, 500);
    });

    it('should return csv data when format is csv', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        const reportData = [
            {
                user_email: 'test@example.com',
                percentage: 100,
                time_spent_seconds: 600,
                completed_at: new Date().toISOString(),
                courses: { title: 'Test Course' },
                user_profiles: { full_name: 'Test User', department: 'Sales' }
            }
        ];
        rpcStub.withArgs('get_detailed_report_data', sinon.match.any).resolves({ data: reportData, error: null });

        const response = await request(app)
            .post('/api/getDetailedReport')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ format: 'csv' });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.headers['content-type'], 'text/csv; charset=utf-8');
        assert(response.text.includes('"Test User"'));
        assert(response.text.includes('"test@example.com"'));
        assert(response.text.includes('"Sales"'));
        assert(response.text.includes('"Test Course"'));
    });
});
