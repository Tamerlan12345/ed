const crypto = require('crypto');
const axios = require('axios');
const { createSupabaseAdminClient } = require('../lib/supabaseClient');
const { handlePresentationProcessing, handleUploadAndProcess, handleGenerateContent, handleGenerateSummary, handleParseQuestions } = require('../services/backgroundJobs');
const { ACTIONS } = require('../../shared/constants');
const { adminActionSchema } = require('../schemas/adminSchema');

// --- Admin Action Handlers ---
const adminActionHandlers = {
    [ACTIONS.CREATE_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { title, deadline_days } = payload;
        const insertData = { title };
        if (deadline_days) {
            insertData.deadline_days = deadline_days;
        }
        const { data, error } = await supabaseAdmin.from('courses').insert(insertData).select().single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.GET_COURSES_ADMIN]: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin
            .from('courses')
            .select(`*, course_group_items (course_groups (group_name))`);

        if (error) {
            console.error('Error fetching courses with groups:', error);
            throw error;
        }

        return data.map(course => {
            const groupItem = course.course_group_items && course.course_group_items.length > 0 ? course.course_group_items[0] : null;
            const groupName = groupItem && groupItem.course_groups ? groupItem.course_groups.group_name : null;
            const newCourse = { ...course };
            delete newCourse.course_group_items;
            newCourse.group_name = groupName;
            return newCourse;
        });
    },
    [ACTIONS.GET_ALL_USERS]: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.rpc('get_all_users_with_details');
        if (error) throw error;
        return data;
    },
    [ACTIONS.GET_DEPARTMENTS]: async ({ supabaseAdmin }) => {
        const { data: users, error } = await supabaseAdmin.from('users').select('department');
        if (error) throw error;
        return [...new Set(users.map(u => u.department).filter(d => d && d.trim() !== ''))].sort();
    },
    [ACTIONS.GET_COURSE_DETAILS]: async ({ payload, supabaseAdmin }) => {
        const { course_id } = payload;
        const { data: course, error } = await supabaseAdmin.from('courses').select('*, course_materials(*)').eq('id', course_id).single();
        if (error) throw error;
        return course;
    },
    [ACTIONS.SAVE_COURSE_DRAFT]: async ({ payload, supabaseAdmin }) => {
        const { course_id, draft_data } = payload;
        const { data, error } = await supabaseAdmin.from('courses').update({ draft_content: draft_data, updated_at: new Date().toISOString() }).eq('id', course_id).select('updated_at').single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.PUBLISH_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { course_id, title, description, content, is_visible, deadline_days } = payload;
        const { error } = await supabaseAdmin
            .from('courses')
            .update({
                title,
                description,
                content,
                status: 'published',
                is_visible: is_visible,
                draft_content: null,
                updated_at: new Date().toISOString(),
                deadline_days: deadline_days || null
            })
            .eq('id', course_id);
        if (error) throw error;
        return { message: `Course ${course_id} successfully published.` };
    },
    [ACTIONS.DELETE_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { course_id } = payload;
        await supabaseAdmin.from('course_materials').delete().eq('course_id', course_id);
        await supabaseAdmin.from('user_progress').delete().eq('course_id', course_id);
        await supabaseAdmin.from('courses').delete().eq('id', course_id);
        return { message: `Course ${course_id} deleted.` };
    },
    [ACTIONS.UPLOAD_AND_PROCESS]: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'file_upload', status: 'pending', payload });
        handleUploadAndProcess(jobId, payload, token).catch(console.error);
        res.status(202).json({ jobId });
        return null;
    },
    [ACTIONS.UPLOAD_AND_PARSE_QUESTIONS]: async ({ payload, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'question_parsing', status: 'pending', payload });
        handleParseQuestions(jobId, payload).catch(console.error);
        res.status(202).json({ jobId });
        return null;
    },
    [ACTIONS.PROCESS_PRESENTATION]: async ({ payload, res }) => {
        const { course_id, presentation_url } = payload;
        const supabaseAdmin = createSupabaseAdminClient();
        const { error: updateError } = await supabaseAdmin.from('courses').update({ presentation_url }).eq('id', course_id);
        if (updateError) throw { status: 500, message: `Failed to save presentation URL: ${updateError.message}` };

        const jobId = crypto.randomUUID();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'presentation_processing', status: 'pending', payload });
        handlePresentationProcessing(jobId, payload).catch(console.error);
        res.status(202).json({ jobId });
        return null;
    },
    [ACTIONS.GENERATE_CONTENT]: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'content_generation', status: 'pending', payload });
        handleGenerateContent(jobId, payload, token).catch(console.error);
        res.status(202).json({ jobId });
        return null;
    },
    [ACTIONS.GET_COURSE_GROUPS]: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('course_groups').select('*');
        if (error) throw error;
        return data;
    },
    [ACTIONS.CREATE_COURSE_GROUP]: async ({ payload, supabaseAdmin }) => {
        const { group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible } = payload;
        const insertData = {
            group_name,
            is_for_new_employees: !!is_for_new_employees,
            start_date: start_date || null,
            recurrence_period: recurrence_period || null,
            enforce_order: !!enforce_order,
            deadline_days: deadline_days || null,
            is_visible: !!is_visible
        };
        const { data, error } = await supabaseAdmin.from('course_groups').insert(insertData).select().single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.UPDATE_COURSE_GROUP]: async ({ payload, supabaseAdmin }) => {
        const { group_id, ...updateData } = payload;
        const { data, error } = await supabaseAdmin.from('course_groups').update(updateData).eq('id', group_id).select().single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.DELETE_COURSE_GROUP]: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);
        await supabaseAdmin.from('course_groups').delete().eq('id', group_id);
        return { message: 'Group deleted successfully.' };
    },
    [ACTIONS.GET_GROUP_DETAILS]: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        const { data, error } = await supabaseAdmin
            .from('course_groups')
            .select('*, course_group_items!inner(course_id, order_index)')
            .eq('id', group_id)
            .order('order_index', { referencedTable: 'course_group_items', ascending: true })
            .single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.UPDATE_COURSES_IN_GROUP]: async ({ payload, supabaseAdmin }) => {
        const { group_id, course_ids } = payload;
        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);
        if (course_ids.length > 0) {
            const itemsToInsert = course_ids.map((course_id, index) => ({ group_id, course_id, order_index: index }));
            await supabaseAdmin.from('course_group_items').insert(itemsToInsert);
        }
        return { message: 'Courses in group updated successfully.' };
    },
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: async ({ payload, supabaseAdmin }) => {
        const { group_id, department } = payload;
        await supabaseAdmin.from('group_assignments').upsert({ group_id, department }, { onConflict: 'group_id, department' });
        const { data: group, error: groupError } = await supabaseAdmin.from('course_groups').select('deadline_days, course_group_items(course_id)').eq('id', group_id).single();
        if (groupError || !group) throw { status: 404, message: 'Course group not found.' };
        const courseIds = group.course_group_items.map(item => item.course_id);
        if (courseIds.length === 0) return { message: 'Group has no courses to assign.' };
        const { data: users, error: usersError } = await supabaseAdmin.from('users').select('id').eq('department', department);
        if (usersError) throw usersError;
        if (users.length === 0) return { message: `No users found in department: ${department}` };
        let deadlineDate = null;
        if (group.deadline_days) {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + group.deadline_days);
            deadlineDate = deadline.toISOString();
        }
        const progressRecords = users.flatMap(user => courseIds.map(courseId => ({ user_id: user.id, course_id: courseId, deadline_date: deadlineDate })));
        if (progressRecords.length > 0) {
            await supabaseAdmin.from('user_progress').upsert(progressRecords, { onConflict: 'user_id, course_id' });
        }
        return { message: `Group assigned to department ${department}. ${progressRecords.length} course assignments created/updated.` };
    },
    [ACTIONS.DELETE_COURSE_MATERIAL]: async ({ payload, supabaseAdmin }) => {
        const { material_id } = payload;
        await supabaseAdmin.from('course_materials').delete().eq('id', material_id);
        return { message: 'Material deleted successfully.' };
    },
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: async ({ payload, supabaseAdmin }) => {
        const { metrics } = payload;
        const { error } = await supabaseAdmin.from('leaderboard_settings').upsert({ id: 1, metrics, updated_at: new Date().toISOString() });
        if (error) throw error;
        return { message: 'Leaderboard settings saved.' };
    },
    [ACTIONS.ASSIGN_COURSE_TO_USER]: async ({ payload, supabaseAdmin }) => {
        const { user_email, course_id } = payload;
        const { data: user, error: rpcError } = await supabaseAdmin.rpc('get_user_by_email', { user_email }).single();
        if (rpcError) throw { status: 500, message: 'Failed to retrieve user.' };
        if (!user) throw { status: 404, message: `User with email ${user_email} not found.` };
        const { error: insertError } = await supabaseAdmin.from('user_progress').insert({ user_id: user.id, course_id: course_id });
        if (insertError) {
            if (insertError.code === '23505') return { message: `Course already assigned to ${user_email}.` };
            throw insertError;
        }
        return { message: `Course assigned to ${user_email}.` };
    },
    [ACTIONS.TEXT_TO_SPEECH]: async ({ payload }) => {
        const { text } = payload;
        try {
            const bytezResponse = await axios.post(process.env.BYTEZ_API_URL, { model: "suno/bark", input: text }, {
                headers: { 'Authorization': `Bearer ${process.env.BYTEZ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
            const { output, error: bytezError } = bytezResponse.data;
            if (bytezError) throw { status: 502, message: 'Failed to generate audio due to an external service error.' };
            if (!output) throw { status: 502, message: 'Received an invalid response from the audio generation service.' };
            return { url: output };
        } catch (error) {
            if (error.code === 'ECONNABORTED' || error.response?.status === 503) {
                throw { status: 503, message: 'The audio generation service is currently unavailable.' };
            }
            throw { status: error.status || 500, message: error.message || 'An internal error occurred while generating audio.' };
        }
    },
    [ACTIONS.GET_SIMULATION_RESULTS]: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('simulation_results').select('created_at, scenario, persona, evaluation, users(full_name)');
        if (error) throw error;
        return data;
    },
    [ACTIONS.GET_LEADERBOARD_SETTINGS]: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('leaderboard_settings').select('*');
        if (error) throw error;
        return data;
    },
    [ACTIONS.ADD_COURSE_MATERIAL]: async ({ payload, supabaseAdmin }) => {
        const { course_id, file_name, file_url } = payload;
        const { data: dbRecord, error: dbError } = await supabaseAdmin
            .from('course_materials')
            .insert({ course_id, file_name, file_url })
            .select()
            .single();
        if (dbError) throw dbError;
        return dbRecord;
    },
};

const handleAdminAction = async (req, res) => {
    try {
        // Validate the entire request body against the discriminated union schema
        const validatedBody = adminActionSchema.parse(req.body);
        const { action, ...payload } = validatedBody;

        const handler = adminActionHandlers[action];
        // We no longer need to check if handler exists, as the schema validation ensures it.

        const supabaseAdmin = createSupabaseAdminClient();
        const handlerPayload = {
            payload,
            supabaseAdmin,
            user: req.user,
            token: req.token,
            res
        };
        const data = await handler(handlerPayload);

        if (data !== null) {
            res.status(200).json(data);
        }
    } catch (error) {
        if (error instanceof require('zod').ZodError) {
            const errorDetails = error.errors.reduce((acc, err) => {
                const field = err.path.slice(1).join('.'); // a.b.c
                acc[field] = err.message;
                return acc;
            }, {});
            return res.status(400).json({ error: 'Validation failed', details: errorDetails });
        }

        console.error(`Error processing action:`, error);
        const status = error.status || 500;
        const message = error.message || 'An internal server error occurred.';
        res.status(status).json({ error: message, details: error.details });
    }
};

module.exports = {
    handleAdminAction
};
