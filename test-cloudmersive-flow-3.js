const assert = require('assert');
const sinon = require('sinon');
const { SupabaseClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

// Set environment variables for the test
process.env.SUPABASE_URL = "https://wnsdlibhrlmgyszbyxat.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Induc2RsaWJocmxtZ3lzemJ5eGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI4MTQyOCwiZXhwIjoyMDY5ODU3NDI4fQ.M9grlpvV4zBXyblXT46E048WPXrwmieIoy6sgAu5aM0";
process.env.CLOUDMERSIVE_API_KEY = "07a9bbc7-6a99-4ca2-b27b-36623a9b8b08";

// Import the function to be tested
const { handler } = require('./netlify/functions/process-uploaded-file.js');

describe('Cloudmersive Integration Test', () => {
    let storageFromStub, fromStub, convertDocumentAutodetectToTxtStub;

    beforeEach(() => {
        // Mock Supabase storage
        const getPublicUrlStub = sinon.stub().returns({ data: { publicUrl: 'http://fake.url/test.pdf' }, error: null });
        storageFromStub = sinon.stub(SupabaseClient.prototype, 'storage').get(() => ({ from: sinon.stub().returns({ getPublicUrl: getPublicUrlStub }) }));

        // Mock Supabase query
        const updateStub = sinon.stub().returns({ error: null });
        fromStub = sinon.stub(SupabaseClient.prototype, 'from').returns({ update: updateStub });

        // Mock Cloudmersive
        convertDocumentAutodetectToTxtStub = sinon.stub().yields(null, { TextResult: 'This is the extracted text.' });
        sinon.stub(CloudmersiveConvertApiClient, 'ConvertDocumentApi').returns({ convertDocumentAutodetectToTxt: convertDocumentAutodetectToTxtStub });
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
        assert(storageFromStub.get.firstCall.returnValue.from.calledWith('course-files'));
        assert(fromStub.calledWith('courses'));
        assert(fromStub.firstCall.returnValue.update.calledWith({ source_text: 'This is the extracted text.', status: 'processed' }));
        assert(convertDocumentAutodetectToTxtStub.calledOnce);
    });
});
