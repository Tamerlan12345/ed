
const { handleUploadAndProcess } = require('../server/services/backgroundJobs');
const { parsePptxToHtml } = require('../server/services/pptxParser');
const sinon = require('sinon');
const assert = require('assert');
const proxyquire = require('proxyquire');

// Mock dependencies
const supabaseMock = {
    from: sinon.stub().returnsThis(),
    update: sinon.stub().returnsThis(),
    eq: sinon.stub().returnsThis(),
    insert: sinon.stub().returnsThis(),
    storage: {
        from: sinon.stub().returnsThis(),
        upload: sinon.stub().returnsThis(),
        getPublicUrl: sinon.stub().returns({ data: { publicUrl: 'http://mock-url' } })
    }
};

// Mock pptxParser to avoid needing a real file
const pptxParserMock = {
    parsePptxToHtml: sinon.stub()
};

// Re-require backgroundJobs with mocks
const backgroundJobs = proxyquire('../server/services/backgroundJobs', {
    '../lib/supabaseClient': {
        createSupabaseAdminClient: () => supabaseMock
    },
    './pptxParser': pptxParserMock
});

describe('PPTX Integration Test', () => {
    beforeEach(() => {
        // Reset stubs
        supabaseMock.from.resetHistory();
        supabaseMock.update.resetHistory();
        pptxParserMock.parsePptxToHtml.resetHistory();

        // Setup successful DB responses
        supabaseMock.update.resolves({ error: null });
        supabaseMock.eq.returnsThis();
    });

    it('should call parsePptxToHtml when processing a .pptx file', async () => {
        const jobId = 'test-job-123';
        const payload = {
            course_id: 'course-123',
            title: 'Test Presentation',
            file_name: 'presentation.pptx',
            file_data: Buffer.from('mock-pptx-data').toString('base64'),
            upload_mode: 'course_material'
        };

        // Mock parser response
        const mockSlides = [
            { slide_title: 'Slide 1', html_content: '<div>Slide 1</div>' },
            { slide_title: 'Slide 2', html_content: '<div>Slide 2</div>' }
        ];
        pptxParserMock.parsePptxToHtml.resolves(mockSlides);

        await backgroundJobs.handleUploadAndProcess(jobId, payload);

        // Verify parser was called
        assert(pptxParserMock.parsePptxToHtml.calledOnce, 'parsePptxToHtml should be called once');

        // Verify DB update was called with correct content
        const coursesUpdate = supabaseMock.from.getCalls().find(call => call.args[0] === 'courses');
        assert(coursesUpdate, 'Should have updated courses table');

        // We need to find the .update call chained to this .from('courses')
        // Since we are mocking with returnsThis(), all calls share the same stubs.
        // We can inspect all arguments passed to update.

        const updateArgs = supabaseMock.update.args.find(arg => arg[0] && arg[0].content && arg[0].content.summary);
        assert(updateArgs, 'Should have called update with content');
        assert.deepStrictEqual(updateArgs[0].content.summary.slides, mockSlides, 'Slides should match parsed output');
    });

    it('should handle errors from parser', async () => {
        const jobId = 'test-job-error';
        const payload = {
            course_id: 'course-error',
            file_name: 'broken.pptx',
            file_data: 'base64',
            upload_mode: 'course_material'
        };

        pptxParserMock.parsePptxToHtml.rejects(new Error('Parsing failed'));

        await backgroundJobs.handleUploadAndProcess(jobId, payload);

        // Should update job status to failed
        const statusUpdate = supabaseMock.update.args.find(arg => arg[0].status === 'failed');
        assert(statusUpdate, 'Should update job status to failed');
        assert(statusUpdate[0].last_error.includes('Parsing failed'), 'Error message should be preserved');
    });

    it('should verify pptxParser module exports the correct function', () => {
        // Real require to verify file existence and export
        const realParser = require('../server/services/pptxParser');
        assert(typeof realParser.parsePptxToHtml === 'function', 'parsePptxToHtml should be a function');
    });
});
