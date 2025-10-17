const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'config.env.example') });

// Set placeholder env vars for testing
process.env.SUPABASE_URL = 'http://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test_anon_key';
process.env.SUPABASE_SERVICE_KEY = 'test_service_key';


describe('Validation Middleware', () => {
    let app;
    let adminAuthMiddlewareStub;
    let handleAdminActionStub;

    beforeEach(() => {
        adminAuthMiddlewareStub = (req, res, next) => next();

        const supabaseClientMock = {
            createSupabaseClient: () => ({}),
            createSupabaseAdminClient: () => ({
                from: () => ({
                    insert: () => ({
                        select: () => ({
                            single: () => ({ data: { id: '123' }, error: null })
                        })
                    })
                })
            }),
        };

        const adminController = proxyquire('../../server/controllers/adminController', {
            '../lib/supabaseClient': supabaseClientMock
        });

        const server = proxyquire('../../server/index', {
            './routes/api': proxyquire('../../server/routes/api', {
                '../middleware/adminAuth': adminAuthMiddlewareStub,
                '../controllers/adminController': adminController,
                '../controllers/reportController': { getDetailedReport: (req, res) => res.status(200).send() },
                '../controllers/userController': {},
            })
        });
        app = server.app;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should pass validation for a valid CREATE_COURSE action', async () => {
        const validPayload = {
            action: 'CREATE_COURSE',
            title: 'My New Course',
            deadline_days: 30
        };

        await request(app)
            .post('/api/admin')
            .send(validPayload)
            .expect(200);

        expect(handleAdminActionStub.calledOnce).to.be.true;
    });

    it('should fail validation if title is missing for CREATE_COURSE', async () => {
        const invalidPayload = {
            action: 'CREATE_COURSE',
            deadline_days: 30
        };

        const response = await request(app)
            .post('/api/admin')
            .send(invalidPayload)
            .expect(400);

        expect(response.body.error).to.equal('Validation failed');
        expect(response.body.details).to.have.property('title');
        expect(handleAdminActionStub.called).to.be.false;
    });

    it('should fail validation if deadline_days is not a number for CREATE_COURSE', async () => {
        const invalidPayload = {
            action: 'CREATE_COURSE',
            title: 'My New Course',
            deadline_days: "thirty"
        };

        const response = await request(app)
            .post('/api/admin')
            .send(invalidPayload)
            .expect(400);

        expect(response.body.error).to.equal('Validation failed');
        expect(response.body.details).to.have.property('deadline_days');
        expect(handleAdminActionStub.called).to.be.false;
    });

    it('should fail validation for an unknown action', async () => {
        const invalidPayload = {
            action: 'SOME_BOGUS_ACTION',
            data: 'test'
        };

        const response = await request(app)
            .post('/api/admin')
            .send(invalidPayload)
            .expect(400);

        expect(response.body.error).to.equal('Validation failed');
        // The error message for a discriminated union is a bit different
        expect(response.body.details).to.have.property('action');
        expect(handleAdminActionStub.called).to.be.false;
    });
});