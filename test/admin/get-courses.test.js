const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Admin: Get Courses', () => {
    let handler;
    let supabaseMock;
    let handleErrorMock;

    beforeEach(() => {
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"Internal Server Error"}' });

        supabaseMock = {
            from: sinon.stub().returnsThis(),
            select: sinon.stub(),
        };

        const createClientMock = sinon.stub().returns(supabaseMock);

        // We only mock what's actually imported by the handler
        handler = proxyquire('../../netlify/functions/admin/get-courses', {
            '@supabase/supabase-js': { createClient: createClientMock },
            '../utils/errors': { handleError: handleErrorMock },
        }).handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return 200 with courses from the database', async () => {
        const courses = [{ id: 1, title: 'Test Course' }];
        supabaseMock.select.resolves({ data: courses, error: null });

        // The event body is not used by the handler, but the auth header is
        const event = {
            headers: { authorization: 'Bearer fake-token' }
        };

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), courses);
        assert(supabaseMock.from.calledWith('courses'));
        assert(supabaseMock.select.calledWith('*'));
    });

    it('should call handleError on database error', async () => {
        const dbError = new Error('Database error');
        supabaseMock.select.resolves({ data: null, error: dbError });

        const event = {
            headers: { authorization: 'Bearer fake-token' }
        };

        await handler(event);

        assert(handleErrorMock.calledOnce);
        assert(handleErrorMock.calledWith(dbError, 'get-courses'));
    });
});
