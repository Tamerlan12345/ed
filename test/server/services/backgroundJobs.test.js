
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fs = require('fs');
const path = require('path');

describe('Background Job: handleParseQuestions', () => {
    let handleParseQuestions;
    let supabaseStub;
    let genAIStub;
    let mammothStub;
    let rtfParserStub;


    beforeEach(() => {
        // Mock for Supabase
        const fromStub = sinon.stub();
        const coursesUpdateStub = sinon.stub().returnsThis();
        const jobsUpdateStub = sinon.stub().returnsThis();
        const eqStub = sinon.stub().resolves({ error: null });

        fromStub.withArgs('courses').returns({ update: coursesUpdateStub, eq: eqStub });
        fromStub.withArgs('background_jobs').returns({ update: jobsUpdateStub, eq: eqStub });

        supabaseStub = {
            from: fromStub,
            coursesUpdate: coursesUpdateStub, // Expose for assertion
            jobsUpdate: jobsUpdateStub // Expose for assertion
        };

        // Mock for Gemini AI
        const modelStub = {
            generateContent: sinon.stub().resolves({
                response: { text: () => JSON.stringify({ questions: [{ question: 'Test?', options: ['A', 'B'], correct_option_indexes: [0] }] }) }
            })
        };
        genAIStub = {
            GoogleGenerativeAI: sinon.stub().returns({
                getGenerativeModel: sinon.stub().returns(modelStub)
            })
        };

        mammothStub = {
            extractRawText: sinon.stub().resolves({ value: 'Mocked docx text' })
        };

        rtfParserStub = {
            rtfToText: sinon.stub().callsFake((buffer, callback) => {
                callback(null, { content: [{ content: [{ value: 'Mocked rtf text' }] }] });
            })
        };


        // Replace dependencies
        const backgroundJobs = proxyquire('../../../server/services/backgroundJobs', {
            '../lib/supabaseClient': { createSupabaseAdminClient: () => supabaseStub },
            '@google/generative-ai': genAIStub,
            'mammoth': mammothStub,
            'rtf-parser': rtfParserStub
        });
        handleParseQuestions = backgroundJobs.handleParseQuestions;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should correctly parse a docx file and update the course draft', async () => {
        // Arrange: Load the test file and encode to base64
        const docxPath = path.join(__dirname, '../fixtures/test-questions.docx');
        const fileBuffer = fs.readFileSync(docxPath);
        const payload = {
            course_id: 'some-uuid',
            file_name: 'test-questions.docx',
            file_data: fileBuffer.toString('base64')
        };

        // Act: Call the function directly
        await handleParseQuestions('job-id-123', payload);

        // Assert: Check that the correct database call was made to the 'courses' table
        expect(supabaseStub.coursesUpdate.calledOnce).to.be.true;
        const updateCallArgs = supabaseStub.coursesUpdate.firstCall.args[0];
        expect(updateCallArgs.draft_content).to.have.property('questions');
        expect(updateCallArgs.draft_content.questions).to.be.an('array').with.lengthOf(1);
    });
});
