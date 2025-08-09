const assert = require('assert');
const sinon = require('sinon');
const supabase = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

// Set environment variables for the test
process.env.SUPABASE_URL = "https://wnsdlibhrlmgyszbyxat.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Induc2RsaWJocmxtZ3lzemJ5eGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI4MTQyOCwiZXhwIjoyMDY5ODU3NDI4fQ.M9grlpvV4zBXyblXT46E048WPXrwmieIoy6sgAu5aM0";
process.env.CLOUDMERSIVE_API_KEY = "07a9bbc7-6a99-4ca2-b27b-36623a9b8b08";

// Import the function to be tested
const { handler } = require('./netlify/functions/process-uploaded-file.js');

describe('Cloudmersive Integration Test', () => {
    let getPublicUrlStub, updateStub, fromStub, convertDocumentAutodetectToTxtStub;

    beforeEach(() => {
        // Mock Supabase
        getPublicUrlStub = sinon.stub().returns({ data: { publicUrl: 'http://fake.url/test.pdf' }, error: null });
        updateStub = sinon.stub().returns({ error: null });
        fromStub = sinon.stub().returns({ getPublicUrl: getPublicUrlStub, update: updateStub });

        const supabaseClient = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        supabaseClient.storage = { from: fromStub };
        supabaseClient.from = fromStub;

        // Mock Cloudmersive
        convertDocumentAutodetectToTxtStub = sinon.stub().yields(null, { TextResult: 'This is the extracted text.' });
        const cloudmersiveApi = new CloudmersiveConvertApiClient.ConvertDocumentApi();
        cloudmersiveApi.convertDocumentAutodetectToTxt = convertDocumentAutodetectToTxtStub;

        // Stub the constructors to return our mocked instances
        sinon.stub(supabase, 'createClient').returns(supabaseClient);
        sinon.stub(CloudmersiveConvertApiClient, 'ConvertDocumentApi').returns(cloudmersiveApi);
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
        assert(fromStub.calledWith('course-files'));
        assert(getPublicUrlStub.calledWith('course-123/test.pdf'));
        assert(convertDocumentAutodetectToTxtStub.calledOnce);
        assert(fromStub.calledWith('courses'));
        assert(updateStub.calledWith({ source_text: 'This is the extracted text.', status: 'processed' }));
    });
});
