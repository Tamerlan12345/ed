const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('getTestResults Handler', () => {
    let handler;
    let supabaseMock, fromStub;

    beforeEach(() => {
        const queryStub = {
            ilike: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            gte: sinon.stub().returnsThis(),
            lt: sinon.stub().resolves({ data: [], error: null })
        };
        fromStub = sinon.stub().returns({ select: sinon.stub().returns(queryStub) });

        supabaseMock = {
            from: fromStub,
            auth: {
                getUser: sinon.stub().resolves({ data: { user: { email: 'admin@cic.kz' } }, error: null })
            }
        };

        const module = proxyquire('../netlify/functions/getTestResults.js', {
            '@supabase/supabase-js': { createClient: () => supabaseMock }
        });
        handler = module.handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return test results with no filters', async () => {
        const event = {
            headers: { authorization: 'Bearer admin_token' },
            body: JSON.stringify({})
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 200);
    });

    it('should filter by user_email', async () => {
        const event = {
            headers: { authorization: 'Bearer admin_token' },
            body: JSON.stringify({ user_email: 'test@test.com' })
        };
        await handler(event);
        const selectStub = fromStub().select();
        assert.ok(selectStub.ilike.calledWith('user_email', '%test@test.com%'));
    });

    it('should filter by course_id', async () => {
        const event = {
            headers: { authorization: 'Bearer admin_token' },
            body: JSON.stringify({ course_id: 'test-course' })
        };
        await handler(event);
        const selectStub = fromStub().select();
        assert.ok(selectStub.eq.calledWith('course_id', 'test-course'));
    });

    it('should filter by date', async () => {
        const event = {
            headers: { authorization: 'Bearer admin_token' },
            body: JSON.stringify({ date: '2023-01-01' })
        };
        await handler(event);
        const selectStub = fromStub().select();
        assert.ok(selectStub.gte.called);
        assert.ok(selectStub.lt.called);
    });

    it('should return 403 for non-admin users', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: { email: 'not-admin@test.com' } }, error: null });
        const event = {
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({})
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 403);
    });

    it('should handle database errors', async () => {
        const queryStub = {
            ilike: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            gte: sinon.stub().returnsThis(),
            lt: sinon.stub().returnsThis(),
            then: function (resolve) {
                resolve({ data: null, error: { message: 'DB Error' } });
            }
        };
        fromStub.returns({ select: sinon.stub().returns(queryStub) });

        const event = {
            headers: { authorization: 'Bearer admin_token' },
            body: JSON.stringify({})
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 500);
    });
});
