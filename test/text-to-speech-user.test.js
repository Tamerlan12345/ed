const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('textToSpeech Handler', () => {
    let handler;
    let supabaseMock;
    let axiosMock;
    let fromStub;
    let genAI_mock;

    const fakeSummary = 'This is a fake summary.';

    beforeEach(() => {
        process.env.SPEECHIFY_API_KEY = 'test_speechify_api_key';
        process.env.GEMINI_API_KEY = 'test_gemini_api_key';

        // Mock for Supabase
        fromStub = sinon.stub();
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
            createClient: () => supabaseMock
        };

        // Mock for axios
        axiosMock = {
            post: sinon.stub().resolves({ data: { audio_data: 'fake_base64_string' } })
        };

        // Mock for Google Generative AI
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
            '@supabase/supabase-js': {
                createClient: () => supabaseMock
            },
            'axios': axiosMock,
            '@google/generative-ai': {
                GoogleGenerativeAI: sinon.stub().returns(genAI_mock)
            }
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

        const summarizationPrompt = `Ты — AI-ассистент. Сделай краткий пересказ предоставленного текста. Пересказ должен быть строго в рамках документа и занимать примерно 5 минут при чтении (около 750 слов). ИСХОДНЫЙ ТЕКСТ: \n---\nHello world\n---`;
        assert(genAI_mock.getGenerativeModel().generateContent.calledWith(summarizationPrompt));

        assert(axiosMock.post.calledWith(
            sinon.match.any,
            sinon.match({ input: fakeSummary.substring(0, 2000) }),
            sinon.match.any
        ));
    });

    it('should return 401 if user is not authorized', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: null }, error: new Error('Unauthorized') });
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const response = await handler(event);

        assert.strictEqual(response.statusCode, 401);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Unauthorized' });
    });

    it('should return 400 if course_id is missing', async () => {
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: {}
        };
        const response = await handler(event);

        assert.strictEqual(response.statusCode, 400);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'course_id is required' });
    });

    it('should return 404 if course not found', async () => {
        fromStub.withArgs('courses').returns({
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
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Source text for this course not found.' });
    });

    it('should return 500 if Gemini API call fails', async () => {
        genAI_mock.getGenerativeModel().generateContent.rejects(new Error('Gemini Error'));
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const response = await handler(event);

        assert.strictEqual(response.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Gemini Error' });
    });

    it('should return 500 if Speechify API call fails', async () => {
        axiosMock.post.rejects(new Error('API Error'));
        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const response = await handler(event);

        assert.strictEqual(response.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Failed to generate audio file from Speechify.' });
    });

    it('should return 500 if Speechify API key is not configured', async () => {
        delete process.env.SPEECHIFY_API_KEY;

        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const module = proxyquire('../netlify/functions/text-to-speech-user.js', {
            '@supabase/supabase-js': { createClient: () => supabaseMock },
            'axios': axiosMock,
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAI_mock) }
        });
        handler = module.handler;

        const response = await handler(event);

        assert.strictEqual(response.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Speechify API key is not configured.' });
    });

    it('should return 500 if Gemini API key is not configured', async () => {
        delete process.env.GEMINI_API_KEY;

        const event = {
            headers: { authorization: 'Bearer FAKE_TOKEN' },
            queryStringParameters: { course_id: '123' }
        };
        const module = proxyquire('../netlify/functions/text-to-speech-user.js', {
            '@supabase/supabase-js': { createClient: () => supabaseMock },
            'axios': axiosMock,
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAI_mock) }
        });
        handler = module.handler;

        const response = await handler(event);

        assert.strictEqual(response.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'GEMINI_API_KEY is not configured.' });
    });
});
