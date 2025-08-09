const assert = require('assert');
const sinon = require('sinon');
const { createClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

// Set environment variables for the test
process.env.SUPABASE_URL = "https://wnsdlibhrlmgyszbyxat.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.CLOUDMERSIVE_API_KEY = "07a9bbc7-6a99-4ca2-b27b-36623a9b8b08";

// Import the function to be tested
const { handler } = require('./netlify/functions/process-uploaded-file.js');

describe('Cloudmersive Integration Test', () => {
    let supabaseMock, cloudmersiveMock;

    beforeEach(() => {
        // Mock Supabase
        const getPublicUrlStub = sinon.stub().returns({ data: { publicUrl: 'http://fake.url/test.pdf' }, error: null });
        const updateStub = sinon.stub().returns({ error: null });
        const fromStub = sinon.stub().returns({ getPublicUrl: getPublicUrlStub, update: updateStub });
        supabaseMock = { storage: { from: fromStub }, from: fromStub };

        // Mock Cloudmersive
        const convertDocumentAutodetectToTxtStub = sinon.stub().yields(null, { TextResult: 'This is the extracted text.' });
        cloudmersiveMock = { convertDocumentAutodetectToTxt: convertDocumentAutodetectToTxtStub };

        // Replace the real clients with mocks
        sinon.stub(createClient, 'createClient').returns(supabaseMock);
        sinon.stub(CloudmersiveConvertApiClient, 'ConvertDocumentApi').returns(cloudmersiveMock);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should process a file successfully', async () => {
        const event = {
            body: JSON.stringify({
                path: 'course-123/test.pdf'
            })
        };

        const response = await handler(event);

        assert.strictEqual(response.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(response.body), { message: 'Successfully processed file for course course-123.' });

        // Verify that the mocks were called correctly
        assert(supabaseMock.storage.from.calledWith('course-files'));
        assert(supabaseMock.storage.from().getPublicUrl.calledWith('course-123/test.pdf'));
        assert(cloudmersiveMock.convertDocumentAutodetectToTxt.calledOnce);
        assert(supabaseMock.from.calledWith('courses'));
        assert(supabaseMock.from().update.calledWith({ source_text: 'This is the extracted text.', status: 'processed' }));
    });
});
