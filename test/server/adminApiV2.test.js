const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Admin API V2 Endpoints', () => {
    let app;
    let supabaseStub;
    let adminAuthMiddlewareStub;

    beforeEach(() => {
        // Mock the admin authentication middleware to always pass
        adminAuthMiddlewareStub = (req, res, next) => {
            req.user = { id: 'admin-user-id', user_metadata: { role: 'admin' } };
            next();
        };

        // Create a detailed stub for the Supabase admin client
        supabaseStub = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub().returnsThis(),
            insert: sinon.stub().returnsThis(),
            delete: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            order: sinon.stub().returnsThis(),
            limit: sinon.stub().returnsThis(),
            single: sinon.stub(),
            rpc: sinon.stub(),
            auth: {
                admin: {
                    deleteUser: sinon.stub(),
                },
            },
        };

        // Use proxyquire to inject our stubs
        const adminApiV2ControllerMock = proxyquire('../../server/controllers/adminApiV2Controller', {
            '../lib/supabaseClient': {
                createSupabaseAdminClient: () => supabaseStub,
            },
        });

        const apiRoutesMock = proxyquire('../../server/routes/api', {
            '../middleware/adminAuth': adminAuthMiddlewareStub,
            '../controllers/adminApiV2Controller': adminApiV2ControllerMock,
            // Stub other dependencies of api.js to avoid side effects
            '../middleware/userAuth': (req, res, next) => next(),
            '../controllers/adminController': { handleAdminAction: (req, res) => res.status(501).send() },
            '../controllers/reportController': { getDetailedReport: (req, res) => res.status(501).send() },
            '../controllers/userController': {},
        });

        const server = proxyquire('../../server/index', {
            './routes/api': apiRoutesMock,
        });

        app = server.app;
    });

    afterEach(() => {
        sinon.restore();
    });

    // --- Tests for /api/users ---
    describe('GET /api/users', () => {
        it('should return a list of users on success', async () => {
            const fakeUsers = [{ id: 'user-1', full_name: 'John Doe' }, { id: 'user-2', full_name: 'Jane Doe' }];
            supabaseStub.rpc.withArgs('get_all_users_with_details').resolves({ data: fakeUsers, error: null });

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(fakeUsers);
        });

        it('should return 500 if the database call fails', async () => {
            supabaseStub.rpc.withArgs('get_all_users_with_details').rejects(new Error('DB Error'));

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(500);
        });
    });

    describe('DELETE /api/users/:userId', () => {
        it('should delete a user successfully', async () => {
            const userId = 'user-to-delete';
            supabaseStub.auth.admin.deleteUser.resolves({ error: null });

            const response = await request(app)
                .delete(`/api/users/${userId}`)
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(200);
            expect(response.body.message).to.equal(`User ${userId} deleted successfully.`);
            expect(supabaseStub.auth.admin.deleteUser.calledOnceWith(userId)).to.be.true;
        });
    });

    // --- Tests for /api/courses ---
    describe('GET /api/courses', () => {
        it('should return a list of courses', async () => {
            const fakeCourses = [{ id: 'course-1', title: 'Course 1', course_group_items: [] }];
            supabaseStub.select.resolves({ data: fakeCourses, error: null });

            const response = await request(app)
                .get('/api/courses')
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(200);
            expect(response.body).to.be.an('array');
        });
    });

    describe('POST /api/courses', () => {
        it('should create a new course', async () => {
            const newCourseData = { title: 'New Course from Test' };
            const createdCourse = { id: 'new-id-123', ...newCourseData };
            supabaseStub.single.resolves({ data: createdCourse, error: null });

            const response = await request(app)
                .post('/api/courses')
                .set('Authorization', 'Bearer mock-admin-token')
                .send(newCourseData);

            expect(response.status).to.equal(201);
            expect(response.body).to.deep.equal(createdCourse);
        });

        it('should return 400 if title is missing', async () => {
            const response = await request(app)
                .post('/api/courses')
                .set('Authorization', 'Bearer mock-admin-token')
                .send({});

            expect(response.status).to.equal(400);
        });
    });

    describe('DELETE /api/courses/:courseId', () => {
        it('should delete a course successfully', async () => {
            const courseId = 'course-to-delete';
            supabaseStub.delete.resolves({ error: null });

            const response = await request(app)
                .delete(`/api/courses/${courseId}`)
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(200);
            expect(response.body.message).to.equal(`Course ${courseId} deleted successfully.`);
        });
    });

    // --- Tests for /api/jobs ---
    describe('GET /api/jobs', () => {
        it('should return a list of jobs', async () => {
            const fakeJobs = [{ id: 'job-1', status: 'completed' }];
            supabaseStub.limit.resolves({ data: fakeJobs, error: null });

            const response = await request(app)
                .get('/api/jobs')
                .set('Authorization', 'Bearer mock-admin-token');

            expect(response.status).to.equal(200);
            expect(response.body).to.deep.equal(fakeJobs);
        });
    });
});