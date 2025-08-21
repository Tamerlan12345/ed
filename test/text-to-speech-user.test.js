const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('textToSpeech Handler', () => {
    let handler;
    let supabaseMock;
    let axiosMock;
    let fromStub;

    beforeEach(() => {
        process.env.SPEECHIFY_API_KEY = 'test_speechify_api_key';
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

        // Load handler with mocks
        const module = proxyquire('../netlify/functions/text-to-speech-user.js', {
            '@supabase/supabase-js': {
                createClient: () => supabaseMock
            },
            'axios': axiosMock
        });
        handler = module.handler;
    });

    afterEach(() => {
        delete process.env.SPEECHIFY_API_KEY;
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
        // Need to re-require the module to get the new process.env value
        const module = proxyquire('../netlify/functions/text-to-speech-user.js', {
            '@supabase/supabase-js': {
                createClient: () => supabaseMock
            },
            'axios': axiosMock
        });
        handler = module.handler;

        const response = await handler(event);

        assert.strictEqual(response.statusCode, 500);
        assert.deepStrictEqual(JSON.parse(response.body), { error: 'Speechify API key is not configured.' });
    });
});
