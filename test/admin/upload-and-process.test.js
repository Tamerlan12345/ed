const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fs = require('fs');
const path = require('path');

describe('Admin: Upload and Process File', () => {
    let handler;
    let supabaseMock;
    let handleErrorMock;
    let mammothMock;
    let pdfParseMock;

    // A simple base64 representation of the string "hello"
    const sampleBase64 = 'aGVsbG8=';

    beforeEach(() => {
        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"Internal Server Error"}' });

        supabaseMock = {
            from: sinon.stub().returnsThis(),
            upsert: sinon.stub(),
        };

        const createClientMock = sinon.stub().returns(supabaseMock);

        mammothMock = {
            extractRawText: sinon.stub(),
        };

        pdfParseMock = sinon.stub();

        handler = proxyquire('../../netlify/functions/admin/upload-and-process', {
            '@supabase/supabase-js': { createClient: createClientMock },
            '../utils/errors': { handleError: handleErrorMock },
            'mammoth': mammothMock,
            'pdf-parse': pdfParseMock,
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

    it('should return 200 and extracted text for a .docx file', async () => {
        const expectedText = 'This is a docx file.';
        mammothMock.extractRawText.resolves({ value: expectedText });
        supabaseMock.upsert.resolves({ error: null });

        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: sampleBase64,
        });

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), { extractedText: expectedText });
        assert(supabaseMock.from.calledWith('courses'));
        assert(supabaseMock.upsert.calledOnce);
        assert.deepStrictEqual(supabaseMock.upsert.firstCall.args[0], {
            course_id: 'test-course',
            title: 'Test Course',
            source_text: expectedText,
            status: 'processed'
        });
    });

    it('should return 200 and extracted text for a .pdf file', async () => {
        const expectedText = 'This is a pdf file.';
        pdfParseMock.resolves({ text: expectedText });
        supabaseMock.upsert.resolves({ error: null });

        const event = createEvent({
            course_id: 'test-course-pdf',
            title: 'Test Course PDF',
            file_name: 'test.pdf',
            file_data: sampleBase64,
        });

        const result = await handler(event);

        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), { extractedText: expectedText });
        assert(supabaseMock.upsert.calledOnce);
    });

    it('should call handleError for missing required fields', async () => {
        const event = createEvent({
            course_id: 'test-course',
            // title is missing
            file_name: 'test.docx',
            file_data: sampleBase64,
        });

        await handler(event);

        assert(handleErrorMock.calledOnce);
        const error = handleErrorMock.firstCall.args[0];
        assert.strictEqual(error.message, 'Missing required fields: course_id, title, file_name, or file_data.');
    });

    it('should call handleError for unsupported file type', async () => {
        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.txt',
            file_data: sampleBase64,
        });

        await handler(event);

        assert(handleErrorMock.calledOnce);
        const error = handleErrorMock.firstCall.args[0];
        assert.strictEqual(error.message, 'Failed to process file: Unsupported file type. Please upload a .docx or .pdf file.');
    });

    it('should call handleError on database upsert error', async () => {
        const dbError = new Error('DB Write Failed');
        mammothMock.extractRawText.resolves({ value: 'some text' });
        supabaseMock.upsert.resolves({ error: dbError });

        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: sampleBase64,
        });

        await handler(event);

        assert(handleErrorMock.calledOnce);
        assert(handleErrorMock.calledWith(sinon.match.has('message', 'Failed to save course content to the database.'), 'upload-and-process'));
    });

    it('should call handleError when text extraction fails', async () => {
        mammothMock.extractRawText.resolves({ value: '' }); // Simulate empty extraction
        supabaseMock.upsert.resolves({ error: null });

        const event = createEvent({
            course_id: 'test-course',
            title: 'Test Course',
            file_name: 'test.docx',
            file_data: sampleBase64,
        });

        await handler(event);

        assert(handleErrorMock.calledOnce);
        assert(handleErrorMock.calledWith(sinon.match.has('message', 'Failed to process file: Could not extract text from the document. The file might be empty or corrupted.'), 'upload-and-process'));
    });
});
