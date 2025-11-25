const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const jwt = require('jsonwebtoken');

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

        // A mock for the entire supabaseClient module, preventing the original file from being loaded
        const supabaseClientMock = {
            createSupabaseClient: () => supabaseStub,
            createSupabaseAdminClient: () => supabaseStub,
        };

        // Use proxyquire to inject the mocked middleware and the mocked supabase client module
        const server = proxyquire('../../server/index', {
            './routes/api': proxyquire('../../server/routes/api', {
                '../middleware/adminAuth': adminAuthMiddlewareStub,
                '../middleware/userAuth': userAuthMiddlewareStub,
                '../controllers/adminController': proxyquire('../../server/controllers/adminController', {
                    '../lib/supabaseClient': supabaseClientMock
                }),
                 '../controllers/reportController': proxyquire('../../server/controllers/reportController', {
                    '../lib/supabaseClient': supabaseClientMock
                }),
                '../controllers/userController': proxyquire('../../server/controllers/userController', {
                    '../lib/supabaseClient': supabaseClientMock
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

    describe('POST /api/getCourseContent', () => {
        it('should return a maximum of 15 shuffled questions if more than 15 are available', async () => {
            // Create 20 mock questions
            const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
                question: `Question ${i + 1}`,
                options: ['A', 'B', 'C'],
                correct_option_index: 0,
            }));
            const fakeCourse = {
                id: 'course-with-many-questions',
                content: {
                    summary: { slides: [] },
                    questions: mockQuestions,
                },
                course_materials: [],
            };
            supabaseStub.single.resolves({ data: fakeCourse, error: null });

            const response = await request(app)
                .post('/api/getCourseContent')
                .set('Authorization', 'Bearer mock-user-token') // Pass user auth
                .send({ course_id: 'course-with-many-questions' });

            expect(response.status).to.equal(200);
            expect(response.body.questions).to.be.an('array');
            expect(response.body.questions).to.have.lengthOf(15);
        });

        it('should return all shuffled questions if 15 or fewer are available', async () => {
            // Create 10 mock questions
            const mockQuestions = Array.from({ length: 10 }, (_, i) => ({
                question: `Question ${i + 1}`,
                options: ['A', 'B'],
                correct_option_index: 1,
            }));
            const fakeCourse = {
                id: 'course-with-few-questions',
                content: JSON.stringify({ // Test with stringified content
                    summary: { slides: [] },
                    questions: mockQuestions,
                }),
                course_materials: [],
            };
            supabaseStub.single.resolves({ data: fakeCourse, error: null });

            const response = await request(app)
                .post('/api/getCourseContent')
                .set('Authorization', 'Bearer mock-user-token')
                .send({ course_id: 'course-with-few-questions' });

            expect(response.status).to.equal(200);
            expect(response.body.questions).to.be.an('array');
            expect(response.body.questions).to.have.lengthOf(10);
        });

        it('should return an empty array if no questions are available', async () => {
            const fakeCourse = {
                id: 'course-with-no-questions',
                content: {
                    summary: { slides: [] },
                    questions: [],
                },
                course_materials: [],
            };
            supabaseStub.single.resolves({ data: fakeCourse, error: null });

            const response = await request(app)
                .post('/api/getCourseContent')
                .set('Authorization', 'Bearer mock-user-token')
                .send({ course_id: 'course-with-no-questions' });

            expect(response.status).to.equal(200);
            expect(response.body.questions).to.be.an('array');
            expect(response.body.questions).to.have.lengthOf(0);
        });
    });

    describe('POST /api/generate-jitsi-token', () => {
        const mockRoomName = 'test-room-123';
        const mockJitsiAppId = 'test-app-id';
        const mockJitsiAppSecret = 'test-app-secret';

        beforeEach(() => {
            // Set up environment variables for the test
            process.env.JITSI_APP_ID = mockJitsiAppId;
            process.env.JITSI_APP_SECRET = mockJitsiAppSecret;
        });

        afterEach(() => {
            // Clean up environment variables
            delete process.env.JITSI_APP_ID;
            delete process.env.JITSI_APP_SECRET;
        });

        it('should generate a valid token for a regular user', async () => {
            const fakeUser = { full_name: 'Test User', is_admin: false };
            supabaseStub.single.resolves({ data: fakeUser, error: null });

            const response = await request(app)
                .post('/api/generate-jitsi-token')
                .set('Authorization', 'Bearer mock-user-token')
                .send({ roomName: mockRoomName });

            expect(response.status).to.equal(200);
            expect(response.body).to.have.property('token');

            // Verify the token content
            const decoded = jwt.verify(response.body.token, mockJitsiAppSecret);
            expect(decoded.iss).to.equal(mockJitsiAppId);
            expect(decoded.room).to.equal(mockRoomName);
            expect(decoded.context.user.name).to.equal(fakeUser.full_name);
            expect(decoded.moderator).to.be.false;
        });

        it('should generate a valid token for an admin user with moderator privileges', async () => {
            const fakeAdmin = { full_name: 'Admin User', is_admin: true };
            supabaseStub.single.resolves({ data: fakeAdmin, error: null });

            // For this test, we need to ensure the user middleware can be "tricked"
            // into using a different user ID if needed, but our current setup is fine
            // as long as the stub returns the correct data.

            const response = await request(app)
                .post('/api/generate-jitsi-token')
                .set('Authorization', 'Bearer mock-user-token') // The middleware is stubbed, so this is fine
                .send({ roomName: mockRoomName });

            expect(response.status).to.equal(200);
            expect(response.body).to.have.property('token');

            const decoded = jwt.verify(response.body.token, mockJitsiAppSecret);
            expect(decoded.moderator).to.be.true;
            expect(decoded.context.user.name).to.equal(fakeAdmin.full_name);
        });

        it('should return 400 if roomName is not provided', async () => {
            const response = await request(app)
                .post('/api/generate-jitsi-token')
                .set('Authorization', 'Bearer mock-user-token')
                .send({});

            expect(response.status).to.equal(400);
        });

        it('should return 500 if Jitsi secrets are not configured', async () => {
            delete process.env.JITSI_APP_ID; // Simulate missing config
            const fakeUser = { full_name: 'Test User', is_admin: false };
            supabaseStub.single.resolves({ data: fakeUser, error: null });

            const response = await request(app)
                .post('/api/generate-jitsi-token')
                .set('Authorization', 'Bearer mock-user-token')
                .send({ roomName: mockRoomName });

            expect(response.status).to.equal(500);
            expect(response.body.error).to.include('not configured');
        });

        it('should return 500 if database call fails', async () => {
            supabaseStub.single.resolves({ data: null, error: new Error('DB Error') });

            const response = await request(app)
                .post('/api/generate-jitsi-token')
                .set('Authorization', 'Bearer mock-user-token')
                .send({ roomName: mockRoomName });

            expect(response.status).to.equal(500);
            expect(response.body.error).to.equal('Failed to generate token.');
        });
    });
});
