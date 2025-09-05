const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('admin-handler', () => {
    let handler;
    let supabaseMock, fromStub, storageStub, genAIMock, mammothMock, pdfMock, axiosMock;

    beforeEach(() => {
        fromStub = sinon.stub();
        storageStub = sinon.stub();

        // --- Mocks for chaining ---
        const eqStub = sinon.stub();
        const updateStub = sinon.stub().returns({ eq: eqStub });
        const singleStub = sinon.stub().resolves({ data: { source_text: 'test source' }, error: null });
        const selectStub = sinon.stub().returns({ eq: eqStub, single: singleStub });
        const insertStub = sinon.stub().returns({ select: selectStub });
        const upsertStub = sinon.stub().resolves({ error: null });
        const deleteStub = sinon.stub().returns({ eq: eqStub });

        eqStub.resolves({ data: [], error: null }); // Default for eq
        eqStub.returns({
            update: updateStub,
            select: selectStub,
            delete: deleteStub,
            single: singleStub,
        });

        fromStub.returns({
            select: selectStub,
            update: updateStub,
            insert: insertStub,
            upsert: upsertStub,
            delete: deleteStub,
            eq: eqStub,
        });

        // Mock for Storage
        storageStub.returns({
            upload: sinon.stub().resolves({ error: null }),
            remove: sinon.stub().resolves({ error: null })
        });

        supabaseMock = {
            from: fromStub,
            storage: { from: storageStub },
            auth: { getUser: sinon.stub().resolves({ data: { user: { email: 'admin@cic.kz' } }, error: null }) }
        };

        // Other mocks
        genAIMock = { getGenerativeModel: sinon.stub().returns({ generateContent: sinon.stub().resolves({ response: { text: () => '{}' } }) }) };
        mammothMock = { extractRawText: sinon.stub().resolves({ value: 'docx text' }) };
        pdfMock = sinon.stub().resolves({ text: 'pdf text' });
        axiosMock = { get: sinon.stub().resolves({ data: 'base64-audio-data' }) };

        const module = proxyquire('../netlify/functions/admin-handler.js', {
            '@supabase/supabase-js': { createClient: () => supabaseMock },
            '@google/generative-ai': { GoogleGenerativeAI: sinon.stub().returns(genAIMock) },
            'mammoth': mammothMock, 'pdf-parse': pdfMock, 'axios': axiosMock
        });
        handler = module.handler;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should deny access if user is not admin', async () => {
        supabaseMock.auth.getUser.resolves({ data: { user: { email: 'not-admin@test.com' } }, error: null });
        const event = { headers: { authorization: 'Bearer valid_token' }, body: JSON.stringify({ action: 'get_courses_admin' }) };
        const response = await handler(event);
        assert.strictEqual(response.statusCode, 403);
        assert.deepStrictEqual(JSON.parse(response.body).error, 'Access denied.');
    });

    describe('Action: publish_course', () => {
        it('should include product_line in the update payload when publishing a course', async () => {
            const updateStub = sinon.stub().returns({ eq: sinon.stub().resolves({ error: null }) });
            fromStub.withArgs('courses').returns({ update: updateStub });

            const payload = {
                action: 'publish_course',
                course_id: 'kasko-2025',
                content_html: [],
                questions: [],
                product_line: 'КАСКО'
            };
            const event = { headers: { authorization: 'Bearer admin_token' }, body: JSON.stringify(payload) };

            await handler(event);

            assert.ok(updateStub.calledOnce, 'Update was not called');
            const updateArg = updateStub.firstCall.args[0];
            assert.ok(updateArg.hasOwnProperty('product_line'), 'Payload does not have product_line');
            assert.strictEqual(updateArg.product_line, 'КАСКО');
        });
    });

    describe('Action: create_course_group', () => {
        it('should insert a new course group and return it', async () => {
            const insertPayload = {
                group_name: 'New Group',
                is_for_new_employees: true,
                start_date: null,
                recurrence_period: null
            };
            const returnedData = { id: 1, ...insertPayload };

            const singleStub = sinon.stub().resolves({ data: returnedData, error: null });
            const selectStub = sinon.stub().returns({ single: singleStub });
            const insertStub = sinon.stub().returns({ select: selectStub });
            fromStub.withArgs('course_groups').returns({ insert: insertStub });

            const eventPayload = { action: 'create_course_group', group_name: 'New Group', is_for_new_employees: true };
            const event = { headers: { authorization: 'Bearer admin_token' }, body: JSON.stringify(eventPayload) };
            const response = await handler(event);

            assert.ok(insertStub.calledWith(insertPayload), 'Insert was not called with the correct payload');
            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), returnedData);
        });
    });
});
