const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Admin: Upload and Process File (Background)', () => {
    let handler;
    let supabaseMock;
    let handleErrorMock;
    let cryptoMock;

    beforeEach(() => {
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"Internal Server Error"}' });

        supabaseMock = {
            from: sinon.stub().returnsThis(),
            insert: sinon.stub().resolves({ error: null }),
            update: sinon.stub().returnsThis(),
            eq: sinon.stub().resolves({ error: null }),
            auth: {
                getUser: sinon.stub().resolves({ data: { user: { id: 'user-123' } } })
            }
        };

        const createClientMock = sinon.stub().returns(supabaseMock);

        cryptoMock = {
            randomUUID: sinon.stub().returns('mock-uuid-123'),
        };

        // We are testing the main handler, not the async processFile part.
        // The processFile function is not exported and runs in the background,
        // so we don't mock mammoth or pdf-parse here.
        handler = proxyquire('../../netlify/functions/admin/upload-and-process-background', {
            '@supabase/supabase-js': { createClient: createClientMock },
            '../utils/errors': { handleError: handleErrorMock },
            'crypto': cryptoMock,
            // We don't need the parsers for this unit test
            'mammoth': {},
            'pdf-parse': {},
        }).handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    const createEvent = (body) => ({
        headers: {
            authorization: 'Bearer fake-token',
        },
        body: JSON.stringify(body),
    });

    it('should return 202 Accepted and a jobId on valid request', async () => {
        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: 'aGVsbG8=',
        });

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 202);
        const body = JSON.parse(result.body);
        assert.strictEqual(body.jobId, 'mock-uuid-123');
        assert.strictEqual(body.message, 'File upload accepted and is being processed in the background.');
    });

    it('should create a job entry in the database', async () => {
        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: 'aGVsbG8=',
        });

        await handler(event);

        assert(supabaseMock.from.calledWith('background_jobs'));
        assert(supabaseMock.insert.calledOnce);
        const insertedData = supabaseMock.insert.firstCall.args[0];
        assert.deepStrictEqual(insertedData, {
            job_id: 'mock-uuid-123',
            job_type: 'file_upload',
            status: 'pending',
            created_by: 'user-123',
            related_entity_id: 'test-course'
        });
    });

    it('should call handleError if creating the initial job entry fails', async () => {
        const dbError = new Error('Insert failed');
        supabaseMock.insert.resolves({ error: dbError });

        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: 'aGVsbG8=',
        });

        await handler(event);

        assert(handleErrorMock.calledOnce);
        assert(handleErrorMock.calledWith(dbError));
    });

    it('should call handleError for invalid JSON body', async () => {
        const event = {
            headers: { authorization: 'Bearer fake-token' },
            body: 'this is not json',
        };

        await handler(event);

        assert(handleErrorMock.calledOnce);
        const error = handleErrorMock.firstCall.args[0];
        assert(error instanceof SyntaxError);
    });
});
