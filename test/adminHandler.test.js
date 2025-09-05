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
            auth: { getUser: sinon.stub().resolves({ data: { user: { email: 'admin@cic.kz' } }, error: null }) },
            rpc: sinon.stub() // Add the rpc stub here
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

    describe('Action: delete_course', () => {
        it('should delete a course and its progress', async () => {
            const eqStub = sinon.stub().resolves({ error: null });
            const deleteStub = sinon.stub().returns({ eq: eqStub });
            fromStub.returns({ delete: deleteStub });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'delete_course', course_id: 'test-course' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), { message: 'Course test-course and all related progress have been successfully deleted.' });
            assert.ok(fromStub.calledWith('user_progress'));
            assert.ok(fromStub.calledWith('courses'));
        });

        it('should return 500 if deleting course progress fails', async () => {
            const eqStub = sinon.stub().resolves({ error: { message: 'DB error' } });
            const deleteStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('user_progress').returns({ delete: deleteStub });
            fromStub.withArgs('courses').returns({ delete: sinon.stub().returns({ eq: sinon.stub().resolves({ error: null }) }) });


            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'delete_course', course_id: 'test-course' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 500);
            const body = JSON.parse(response.body);
            assert.strictEqual(body.error.message, 'Failed to delete user progress for the course.');
        });
    });

    describe('Action: get_course_details', () => {
        it('should return course details and materials', async () => {
            const courseDetails = { course_id: 'test-course', title: 'Test Course', course_materials: [] };
            const singleStub = sinon.stub().resolves({ data: courseDetails, error: null });
            const eqStub = sinon.stub().returns({ single: singleStub });
            const selectStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('courses').returns({ select: selectStub });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'get_course_details', course_id: 'test-course' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), courseDetails);
            assert.ok(selectStub.calledWith('*, course_materials(*)'));
        });
    });

    describe('Course Group Management', () => {
        it('should update a course group', async () => {
            const updatedGroup = { id: 1, group_name: 'Updated Group' };
            const singleStub = sinon.stub().resolves({ data: updatedGroup, error: null });
            const selectStub = sinon.stub().returns({ single: singleStub });
            const eqStub = sinon.stub().returns({ select: selectStub });
            const updateStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('course_groups').returns({ update: updateStub });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'update_course_group', group_id: 1, group_name: 'Updated Group' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), updatedGroup);
        });

        it('should delete a course group', async () => {
            const eqStub = sinon.stub().resolves({ error: null });
            const deleteStub = sinon.stub().returns({ eq: eqStub });
            fromStub.withArgs('course_groups').returns({ delete: deleteStub });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'delete_course_group', group_id: 1 })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), { message: 'Group 1 deleted.' });
        });
    });

    describe('User Management', () => {
        it('should get all users', async () => {
            // Mock the new RPC call
            const users = [{ id: '1', email: 'test@test.com', full_name: 'Test User', department: 'IT' }];
            supabaseMock.rpc.withArgs('get_all_users_with_profiles').resolves({ data: users, error: null });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'get_all_users' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200, `Expected status 200 but got ${response.statusCode}. Body: ${response.body}`);
            const body = JSON.parse(response.body);
            assert.deepStrictEqual(body, users);
            assert.ok(supabaseMock.rpc.calledWith('get_all_users_with_profiles'));
        });

        it('should assign a course to a user', async () => {
            const upsertStub = sinon.stub().resolves({ error: null });
            fromStub.withArgs('user_progress').returns({ upsert: upsertStub });

            const event = {
                headers: { authorization: 'Bearer admin_token' },
                body: JSON.stringify({ action: 'assign_course_to_user', user_email: 'test@test.com', course_id: 'test-course' })
            };
            const response = await handler(event);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), { message: 'Course test-course assigned to test@test.com.' });
        });
    });
});
