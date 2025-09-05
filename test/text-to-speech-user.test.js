const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('textToSpeech Handler', () => {
    let handler;
    let supabaseMock;
    let axiosMock;
    let genAI_mock;
    let handleErrorMock;

    const fakeSummary = 'This is a fake summary.';

    beforeEach(() => {
        process.env.SPEECHIFY_API_KEY = 'test_speechify_api_key';
        process.env.GEMINI_API_KEY = 'test_gemini_api_key';

        handleErrorMock = sinon.stub().returns({ statusCode: 500, body: '{"error":"An internal server error occurred. Please try again later."}' });

        const fromStub = sinon.stub();
        const authStub = {
            getUser: sinon.stub().resolves({ data: { user: { id: '123' } }, error: null })
        };

        fromStub.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: { source_text: 'Hello world' }, error: null })
        });

        supabaseMock = {
            from: fromStub,
            auth: authStub,
        };
        const createClientMock = sinon.stub().returns(supabaseMock);

        axiosMock = {
            post: sinon.stub().resolves({ data: { audio_data: 'fake_base64_string' } })
        };

        genAI_mock = {
            getGenerativeModel: sinon.stub().returns({
                generateContent: sinon.stub().resolves({
                    response: {
                        text: () => fakeSummary
                    }
                })
            })
        };

        const handlerModule = proxyquire('../netlify/functions/text-to-speech-user.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'axios': axiosMock,
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAI_mock) },
            './utils/errors': { handleError: handleErrorMock },
        });
        handler = handlerModule.handler;
    });

    afterEach(() => {
        delete process.env.SPEECHIFY_API_KEY;
        delete process.env.GEMINI_API_KEY;
        sinon.restore();
    });

    it('should return audio data for an authorized user with a valid course_id', async () => {
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const response = await handler(event);
        const body = JSON.parse(response.body);

        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(body.audioUrl, 'data:audio/mp3;base64,fake_base64_string');
    });

    it('should return 401 if user is not authorized', async () => {
        supabaseMock.auth.getUser.rejects(new Error('Unauthorized'));
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        await handler(event);
        assert(handleErrorMock.calledOnce);
    });

    it('should return 400 if course_id is missing', async () => {
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: {}
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 400);
    });

    it('should return 404 if course not found', async () => {
        supabaseMock.from.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: null, error: { message: 'Not found' } })
        });
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '456' }
        };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 404);
    });

    it('should return 500 if Gemini API call fails', async () => {
        genAI_mock.getGenerativeModel().generateContent.rejects(new Error('Gemini Error'));
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        await handler(event);
        assert(handleErrorMock.calledOnce);
    });

    it('should return 500 if Speechify API call fails', async () => {
        axiosMock.post.rejects(new Error('API Error'));
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        await handler(event);
        assert(handleErrorMock.calledOnce);
    });
});
