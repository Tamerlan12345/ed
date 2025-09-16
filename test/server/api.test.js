const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('API Endpoints', () => {
    let app;
    let supabaseStub;
    let createClientStub;

    beforeEach(() => {
        // Set dummy env vars for testing, to prevent the app from crashing on startup
        process.env.SUPABASE_URL = 'http://dummy-url.com';
        process.env.SUPABASE_SERVICE_KEY = 'dummy-key';
        process.env.GEMINI_API_KEY = 'dummy-key';


        // This is the mock for the entire supabase client
        supabaseStub = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub(),
            rpc: sinon.stub().returnsThis(),
            auth: {
                getUser: sinon.stub(),
            },
        };

        // createClient will be our factory for the mock
        createClientStub = sinon.stub().returns(supabaseStub);

        // Now we use proxyquire to inject the mock
        const server = proxyquire('../../server/index', {
            '@supabase/supabase-js': {
                createClient: createClientStub,
            }
        });
        app = server.app;
    });

    afterEach(() => {
        sinon.restore();
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_KEY;
        delete process.env.GEMINI_API_KEY;
    });

    describe('POST /api/get-job-status', () => {
        it('should return job status if job is found', async () => {
            const fakeJob = { id: 'some-job-id', status: 'completed' };
            supabaseStub.single.resolves({ data: fakeJob, error: null });

            const response = await request(app)
                .post('/api/get-job-status')
                .send({ jobId: 'some-job-id' });

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(fakeJob);
            expect(createClientStub.called).to.be.true;
            expect(supabaseStub.from.calledWith('background_jobs')).to.be.true;
            expect(supabaseStub.eq.calledWith('id', 'some-job-id')).to.be.true;
        });

        it('should return 404 if job is not found', async () => {
            supabaseStub.single.resolves({ data: null, error: { message: 'Not found' } });

            const response = await request(app)
                .post('/api/get-job-status')
                .send({ jobId: 'non-existent-job-id' });

            expect(response.status).to.equal(404);
            expect(response.body).to.deep.equal({ error: 'Job not found.' });
        });

        it('should return 400 if jobId is missing', async () => {
            const response = await request(app)
                .post('/api/get-job-status')
                .send({});

            expect(response.status).to.equal(400);
            expect(response.body).to.deep.equal({ error: 'Missing jobId' });
        });

        it('should return 500 on internal server error', async () => {
            supabaseStub.single.rejects(new Error('Internal DB Error'));

            const response = await request(app)
                .post('/api/get-job-status')
                .send({ jobId: 'some-job-id' });

            expect(response.status).to.equal(500);
            expect(response.body).to.deep.equal({ error: 'Internal Server Error' });
        });
    });

    describe('POST /api/admin', () => {
        let adminApp;

        it('should create a course successfully', async () => {
            const adminAuthMiddlewareStub = (req, res, next) => {
                req.user = { id: 'admin-user-id' };
                next();
            };

            const newCourse = { id: 'new-course-id', title: 'New Course' };
            supabaseStub.insert = sinon.stub().returnsThis();
            supabaseStub.select = sinon.stub().returnsThis();
            supabaseStub.single = sinon.stub().resolves({ data: newCourse, error: null });

            const server = proxyquire('../../server/index', {
                './middleware/adminAuth': adminAuthMiddlewareStub,
                '@supabase/supabase-js': { createClient: createClientStub }
            });
            adminApp = server.app;

            const response = await request(adminApp)
                .post('/api/admin')
                .send({ action: 'create_course', title: 'New Course' });

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(newCourse);
            expect(supabaseStub.from.calledWith('courses')).to.be.true;
        });
    });
});
