const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const request = require('supertest');

describe('textToSpeech Handler', () => {
    let app;
    let supabaseMock;
    let axiosMock;
    let genAI_mock;
    let cronMock;
    let createClientMock;
    let authStub;
    let fromStub;

    const fakeSummary = 'This is a fake summary.';

    beforeEach(() => {
        process.env.SPEECHIFY_API_KEY = 'test_speechify_api_key';
        process.env.GEMINI_API_KEY = 'test_gemini_api_key';

        authStub = sinon.stub();
        fromStub = sinon.stub();
        cronMock = { schedule: sinon.stub() };

        fromStub.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: { source_text: 'Hello world' }, error: null })
        });

        supabaseMock = {
            from: fromStub,
            auth: {
                getUser: authStub,
            },
        };
        createClientMock = sinon.stub().returns(supabaseMock);

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

        app = proxyquire('../server/index.js', {
            '@supabase/supabase-js': { createClient: createClientMock },
            'axios': axiosMock,
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAI_mock) },
            'node-cron': cronMock,
        });
    });

    afterEach(() => {
        delete process.env.SPEECHIFY_API_KEY;
        delete process.env.GEMINI_API_KEY;
        sinon.restore();
    });

    it('should return audio data for an authorized user with a valid course_id', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: '123' });

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, { audioUrl: 'data:audio/mp3;base64,fake_base64_string' });
    });

    it('should return 401 if user is not authorized', async () => {
        authStub.resolves({ data: { user: null }, error: { message: 'Unauthorized' } });
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: '123' });
        assert.strictEqual(response.status, 401);
    });

    it('should return 400 if course_id is missing', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({});
        assert.strictEqual(response.status, 400);
    });

    it('should return 404 if course not found', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        fromStub.withArgs('courses').returns({
            select: sinon.stub().returnsThis(),
            eq: sinon.stub().returnsThis(),
            single: sinon.stub().resolves({ data: null, error: null })
        });
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: '456' });
        assert.strictEqual(response.status, 404);
    });

    it('should return 500 if Gemini API call fails', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        genAI_mock.getGenerativeModel().generateContent.rejects(new Error('Gemini Error'));
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: '123' });
        assert.strictEqual(response.status, 500);
    });

    it('should return 500 if Speechify API call fails', async () => {
        authStub.resolves({ data: { user: { id: '123' } }, error: null });
        axiosMock.post.rejects(new Error('API Error'));
        const response = await request(app)
            .post('/api/text-to-speech-user')
            .set('Authorization', 'Bearer FAKE_TOKEN')
            .send({ course_id: '123' });
        assert.strictEqual(response.status, 500);
    });
});
