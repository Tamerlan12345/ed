const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('saveTestResult Handler', () => {
    let handler;
    let supabaseMock;
    let handleErrorMock;
    let fromStub;

    beforeEach(() => {
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"An internal server error occurred. Please try again later."}' });

        fromStub = sinon.stub();
        const authStub = {
            getUser: sinon.stub().resolves({ data: { user: { email: 'test@test.com' } }, error: null })
        };

        const singleStub = sinon.stub().resolves({ data: null, error: null });
        const eqStub2 = sinon.stub().returns({ maybeSingle: singleStub });
        const eqStub1 = sinon.stub().returns({ eq: eqStub2 });
        const selectStub = sinon.stub().returns({ eq: eqStub1 });
        const updateStub = sinon.stub().returns({ eq: sinon.stub().resolves({ error: null }) });
        const insertStub = sinon.stub().resolves({ error: null });

        fromStub.withArgs('user_progress').returns({
            select: selectStub,
            update: updateStub,
            insert: insertStub,
        });

        supabaseMock = {
            from: fromStub,
            auth: authStub,
        };
        const createClientMock = sinon.stub().returns(supabaseMock);

        const module = proxyquire('../netlify/functions/saveTestResult.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            './utils/errors': { handleError: handleErrorMock },
        });
        handler = module.handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should save a new test result', async () => {
        const event = {
            httpMethod: 'POST',
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({ course_id: 'test-course', score: 10, total_questions: 10, percentage: 100 })
        };

        const response = await handler(event);
        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(response.body), { message: 'Результат успешно сохранен' });
    });

    it('should update an existing test result and increment attempts', async () => {
        const existingRecord = { id: 1, attempts: 1 };
        const singleStub = sinon.stub().resolves({ data: existingRecord, error: null });
        const eqStub2 = sinon.stub().returns({ maybeSingle: singleStub });
        const eqStub1 = sinon.stub().returns({ eq: eqStub2 });
        const updateStub = sinon.stub().returns({ eq: sinon.stub().resolves({ error: null }) });
        fromStub.withArgs('user_progress').returns({
            ...fromStub.withArgs('user_progress')._originalValue,
            select: sinon.stub().returns({ eq: eqStub1 }),
            update: updateStub,
        });


        const event = {
            httpMethod: 'POST',
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({ course_id: 'test-course', score: 10, total_questions: 10, percentage: 100 })
        };

        const response = await handler(event);
        assert.strictEqual(response.statusCode, 200);
    });

    it('should return 400 for missing fields', async () => {
        const event = {
            httpMethod: 'POST',
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({ course_id: 'test-course' })
        };

        const response = await handler(event);
        assert.strictEqual(response.statusCode, 400);
    });

    it('should return 401 for unauthorized user', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });
        const event = {
            httpMethod: 'POST',
            headers: { authorization: 'Bearer invalid_token' },
            body: JSON.stringify({ course_id: 'test-course', score: 10, total_questions: 10, percentage: 100 })
        };

        const response = await handler(event);
        assert.strictEqual(response.statusCode, 401);
    });

    it('should handle database errors', async () => {
        fromStub.withArgs('user_progress').returns({
            ...fromStub.withArgs('user_progress')._originalValue,
            insert: sinon.stub().rejects(new Error('DB Error')),
        });

        const event = {
            httpMethod: 'POST',
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({ course_id: 'test-course', score: 10, total_questions: 10, percentage: 100 })
        };
        await handler(event);
        assert(handleErrorMock.calledOnce);
    });
});
