const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('API Endpoints', () => {
    let app;
    let supabaseStub;
    let createClientStub;
    let adminAuthMiddlewareStub;
    let userAuthMiddlewareStub;

    beforeEach(() => {
        // This stub will be used for all tests that require admin authentication
        adminAuthMiddlewareStub = (req, res, next) => {
            req.user = { id: 'admin-user-id', role: 'admin' };
            req.token = 'mock-admin-token';
            next();
        };

        // This stub will be used for all tests that require standard user authentication
        userAuthMiddlewareStub = (req, res, next) => {
            req.user = { id: 'test-user-id', role: 'authenticated' };
            req.supabase = supabaseStub; // Attach the stubbed client for controllers to use
            next();
        };

        // This is the mock for the entire supabase client
        supabaseStub = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub().returnsThis(),
            update: sinon.stub().returnsThis(),
            insert: sinon.stub().returnsThis(),
            delete: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            in: sinon.stub().returnsThis(),
            ilike: sinon.stub().returnsThis(),
            single: sinon.stub(),
            rpc: sinon.stub().returnsThis(),
            // Mock the auth part of the client
            auth: {
                getUser: sinon.stub().resolves({ data: { user: { id: 'test-user-id' } }, error: null }),
            },
            // Mock the storage part of the client
            storage: {
                from: sinon.stub().returnsThis(),
                remove: sinon.stub(),
                upload: sinon.stub(),
                getPublicUrl: sinon.stub(),
            },
        };

        // The factory for our mock client
        createClientStub = sinon.stub().returns(supabaseStub);

        // Use proxyquire to inject the mocked middleware and supabase client
        // This is now more complex due to the refactoring, so we mock at the highest level needed.
        const server = proxyquire('../../server/index', {
            './routes/api': proxyquire('../../server/routes/api', {
                '../middleware/adminAuth': adminAuthMiddlewareStub,
                '../middleware/userAuth': userAuthMiddlewareStub,
                '../controllers/adminController': proxyquire('../../server/controllers/adminController', {
                    '../lib/supabaseClient': { createSupabaseAdminClient: () => supabaseStub }
                }),
                 '../controllers/reportController': proxyquire('../../server/controllers/reportController', {
                    '../lib/supabaseClient': { createSupabaseAdminClient: () => supabaseStub }
                }),
                '../controllers/userController': proxyquire('../../server/controllers/userController', {
                    '../lib/supabaseClient': { createSupabaseClient: () => supabaseStub, createSupabaseAdminClient: () => supabaseStub }
                }),
            })
        });
        app = server.app;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('POST /api/get-job-status', () => {
        it('should return job status if job is found', async () => {
            const fakeJob = { id: 'some-job-id', status: 'completed' };
            // The admin client is used for job status, so we mock its call chain
            supabaseStub.single.resolves({ data: fakeJob, error: null });

            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer mock-token') // Pass auth middleware
                .send({ jobId: 'some-job-id' });

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(fakeJob);
            expect(supabaseStub.from.calledWith('background_jobs')).to.be.true;
            expect(supabaseStub.eq.calledWith('id', 'some-job-id')).to.be.true;
        });

        it('should return 404 if job is not found', async () => {
            supabaseStub.single.resolves({ data: null, error: { message: 'Not found' } });

            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer mock-token')
                .send({ jobId: 'non-existent-job-id' });

            expect(response.status).to.equal(404);
        });

        it('should return 400 if jobId is missing', async () => {
            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer mock-token')
                .send({});

            expect(response.status).to.equal(400);
        });

        it('should return 500 on internal server error', async () => {
            supabaseStub.single.rejects(new Error('Internal DB Error'));

            const response = await request(app)
                .post('/api/get-job-status')
                .set('Authorization', 'Bearer mock-token')
                .send({ jobId: 'some-job-id' });

            expect(response.status).to.equal(500);
        });
    });

    describe('POST /api/admin', () => {
        it('should create a course successfully', async () => {
            const newCourse = { id: 'new-course-id', title: 'New Course' };
            supabaseStub.single.resolves({ data: newCourse, error: null });

            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer mock-admin-token') // Pass admin auth
                .send({ action: 'create_course', title: 'New Course' });

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(newCourse);
            expect(supabaseStub.from.calledWith('courses')).to.be.true;
            expect(supabaseStub.insert.calledWith({ title: 'New Course' })).to.be.true;
        });

        it('should return 400 for an unknown action', async () => {
            const response = await request(app)
                .post('/api/admin')
                .set('Authorization', 'Bearer mock-admin-token')
                .send({ action: 'unknown_action' });

            expect(response.status).to.equal(400);
            expect(response.body.error).to.equal('Unknown action: unknown_action');
        });
    });
});
