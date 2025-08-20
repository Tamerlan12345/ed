const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('admin-handler', () => {
    let handler;
    let supabaseMock, genAIMock, mammothMock, pdfMock, axiosMock;

    beforeEach(() => {
        // --- Mock Supabase ---
        const fromStub = sinon.stub();
        supabaseMock = {
            from: fromStub,
            auth: { getUser: sinon.stub().resolves({ data: { user: { email: 'admin@cic.kz' } }, error: null }) }
        };
        fromStub.returns({
            select: sinon.stub().returnsThis(),
            update: sinon.stub().resolves({ error: null }),
            upsert: sinon.stub().resolves({ error: null }),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: { source_text: 'test source' }, error: null })
        });

        // --- Mock Google Generative AI ---
        genAIMock = {
            getGenerativeModel: sinon.stub().returns({
                generateContent: sinon.stub().resolves({ response: { text: () => '{}' } })
            })
        };

        // --- Mock file processors and axios ---
        mammothMock = { extractRawText: sinon.stub().resolves({ value: 'docx text' }) };
        pdfMock = sinon.stub().resolves({ text: 'pdf text' });
        axiosMock = { get: sinon.stub().resolves({ data: 'base64-audio-data' }) };

        // Use proxyquire to inject all mocks
        const module = proxyquire('../netlify/functions/admin-handler.js', {
            '@supabase/supabase-js': { createClient: () => supabaseMock },
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAIMock) },
            'mammoth': mammothMock,
            'pdf-parse': pdfMock,
            'axios': axiosMock
        });
        handler = module.handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should deny access if user is not admin', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: { email: 'not-admin@test.com' } }, error: null });
        const event = {
            headers: { authorization: 'Bearer valid_token' },
            body: JSON.stringify({ action: 'get_courses_admin' })
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 500);
        assert.ok(JSON.parse(response.body).error.message.includes('Access denied'));
    });

    describe('Action: publish_course', () => {
        it('should save summary, questions, and admin_prompt correctly', async () => {
            const updateStub = sinon.stub().resolves({ error: null });
            supabaseMock.from.withArgs('courses').returns({
                update: updateStub,
                eq: sinon.stub().returnsThis()
            });

            const payload = {
                action: 'publish_course',
                course_id: 'kasko-2025',
                content_html: [{ title: 'Slide 1', html_content: '<p>Content</p>' }],
                questions: [{ question: 'Q1?', options: ['A', 'B'], correct_option_index: 0 }],
                admin_prompt: 'Test prompt'
            };
            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify(payload)
            };

            await handler(event);

            const updateCallArgs = updateStub.firstCall.args[0];
            assert.deepStrictEqual(updateCallArgs.content_html.summary, payload.content_html);
            assert.deepStrictEqual(updateCallArgs.content_html.questions, payload.questions);
            assert.strictEqual(updateCallArgs.content_html.admin_prompt, 'Test prompt');
            assert.strictEqual(updateCallArgs.status, 'published');
        });
    });
});
