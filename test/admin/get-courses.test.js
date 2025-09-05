const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Admin: Get Courses', () => {
    let handler;
    let supabaseMock;
    let isAuthorizedMock;
    let handleErrorMock;

    beforeEach(() => {
        isAuthorizedMock = sinon.stub();
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"Internal Server Error"}' });

        supabaseMock = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub(),
        };

        const createClientMock = sinon.stub().returns(supabaseMock);

        handler = proxyquire('../../netlify/functions/admin/get-courses', {
            '@supabase/supabase-js': { createClient: createClientMock },
            '../utils/auth': { isAuthorized: isAuthorizedMock },
            '../utils/errors': { handleError: handleErrorMock },
        }).handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return 200 with courses for authorized user', async () => {
        isAuthorizedMock.returns(true);
        const courses = [{ id: 1, title: 'Test Course' }];
        supabaseMock.select.resolves({ data: courses, error: null });

        const event = {
            body: JSON.stringify({ roles: ['admin'] }),
        };

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), courses);
        assert(supabaseMock.from.calledWith('courses'));
        assert(supabaseMock.select.calledWith('*'));
    });

    it('should return 403 for unauthorized user', async () => {
        isAuthorizedMock.returns(false);

        const event = {
            body: JSON.stringify({ roles: ['viewer'] }),
        };

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 403);
        assert.deepStrictEqual(JSON.parse(result.body), { error: 'Access denied.' });
    });

    it('should return 500 on database error', async () => {
        isAuthorizedMock.returns(true);
        const dbError = new Error('Database error');
        supabaseMock.select.resolves({ data: null, error: dbError });

        const event = {
            body: JSON.stringify({ roles: ['admin'] }),
        };

        await handler(event);

        assert(handleErrorMock.calledOnce);
        assert(handleErrorMock.calledWith(dbError, 'get-courses'));
    });
});
