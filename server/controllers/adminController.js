const crypto = require('crypto');
const axios = require('axios');
const { createSupabaseAdminClient } = require('../lib/supabaseClient');
const { handlePresentationProcessing, handleUploadAndProcess, handleGenerateContent, handleGenerateSummary } = require('../services/backgroundJobs');
const { ACTIONS } = require('../../shared/constants');

// --- Service URLs ---
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'https://special-pancake-69pp66w7x4qvf5gw7-5001.app.github.dev/generate-audio';

// --- Admin Action Handlers ---
// Using computed property names to reference constants from shared/constants.js
const adminActionHandlers = {
    [ACTIONS.CREATE_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { title } = payload;
        if (!title) throw { status: 400, message: 'Title is required to create a course.' };
        const { data, error } = await supabaseAdmin.from('courses').insert({ title }).select().single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.GET_COURSES_ADMIN]: async ({ supabaseAdmin }) => {
        // Fetch courses and their associated group name through the join table
        const { data, error } = await supabaseAdmin
            .from('courses')
            .select(`
                *,
                course_group_items (
                    course_groups (
                        group_name
                    )
                )
            `);

        if (error) {
            console.error('Error fetching courses with groups:', error);
            throw error;
        }

        // Process the data to create a flat structure for the frontend
        const coursesWithGroup = data.map(course => {
            // A course can be in a group, so course_group_items is an array. We take the first one.
            const groupItem = course.course_group_items && course.course_group_items.length > 0
                ? course.course_group_items[0]
                : null;

            const groupName = groupItem && groupItem.course_groups
                ? groupItem.course_groups.group_name
                : null;

            // Create a new object to avoid modifying the original response object
            const newCourse = { ...course };
            delete newCourse.course_group_items; // Clean up the nested structure
            newCourse.group_name = groupName; // Add the flattened group_name

            return newCourse;
        });

        return coursesWithGroup;
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
        if (!course_id) throw { status: 400, message: 'A valid course_id is required.' };
        const { data, error } = await supabaseAdmin.from('courses').select('*, course_materials(*)').eq('id', course_id).single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.SAVE_COURSE_DRAFT]: async ({ payload, supabaseAdmin }) => {
        const { course_id, draft_data } = payload;
        if (!course_id || !draft_data) {
            throw { status: 400, message: 'course_id and draft_data are required.' };
        }
        const { data, error } = await supabaseAdmin.from('courses').update({ draft_content: draft_data, updated_at: new Date().toISOString() }).eq('id', course_id).select('updated_at').single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.PUBLISH_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { course_id, title, description, content, is_visible } = payload;
        if (!course_id || !title || !content) {
            throw { status: 400, message: 'Course ID, title, and content are required for publishing.' };
        }
        if (typeof is_visible !== 'boolean') {
            throw { status: 400, message: 'A boolean value for is_visible is required.' };
        }

        try {
            JSON.parse(JSON.stringify(content));
        } catch (e) {
            throw { status: 400, message: 'Content must be valid JSON.' };
        }

        const { error } = await supabaseAdmin
            .from('courses')
            .update({
                title,
                description,
                content,
                status: 'published',
                is_visible: is_visible,
                draft_content: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', course_id);

        if (error) throw error;
        return { message: `Course ${course_id} successfully published.` };
    },
    [ACTIONS.DELETE_COURSE]: async ({ payload, supabaseAdmin }) => {
        const { course_id } = payload;
        if (!course_id) throw { status: 400, message: 'course_id is required.' };
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
    [ACTIONS.PROCESS_PRESENTATION]: async ({ payload, res }) => {
        const { course_id, presentation_url } = payload;
        if (!course_id || !presentation_url) {
            throw { status: 400, message: 'course_id and presentation_url are required.' };
        }

        const supabaseAdmin = createSupabaseAdminClient();

        // First, save the URL to the course table
        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({ presentation_url })
            .eq('id', course_id);

        if (updateError) {
            throw { status: 500, message: `Failed to save presentation URL: ${updateError.message}` };
        }

        // Then, start the background job
        const jobId = crypto.randomUUID();
        await supabaseAdmin.from('background_jobs').insert({
            id: jobId,
            job_type: 'presentation_processing',
            status: 'pending',
            payload
        });
        handlePresentationProcessing(jobId, payload).catch(console.error);
        res.status(202).json({ jobId });
        return null; // Important: prevent double response
    },
    [ACTIONS.GENERATE_CONTENT]: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'content_generation', status: 'pending', payload });
        handleGenerateContent(jobId, payload, token).catch(console.error);
        res.status(202).json({ jobId });
        return null;
    },
    [ACTIONS.GENERATE_SUMMARY]: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'summary_generation', status: 'pending', payload });
        handleGenerateSummary(jobId, payload, token).catch(console.error);
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
        if (!group_name) throw { status: 400, message: 'Group name is required.' };
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
        const { group_id, group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible } = payload;
        if (!group_id || !group_name) throw { status: 400, message: 'Group ID and name are required.' };
        const updateData = { group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible };
        const { data, error } = await supabaseAdmin.from('course_groups').update(updateData).eq('id', group_id).select().single();
        if (error) throw error;
        return data;
    },
    [ACTIONS.DELETE_COURSE_GROUP]: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        if (!group_id) throw { status: 400, message: 'Group ID is required.' };
        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);
        await supabaseAdmin.from('course_groups').delete().eq('id', group_id);
        return { message: 'Group deleted successfully.' };
    },
    [ACTIONS.GET_GROUP_DETAILS]: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        if (!group_id) throw { status: 400, message: 'Group ID is required.' };
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
        if (!group_id || !Array.isArray(course_ids)) throw { status: 400, message: 'Group ID and ordered course_ids array are required.' };

        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);

        if (course_ids.length > 0) {
            const itemsToInsert = course_ids.map((course_id, index) => ({
                group_id,
                course_id,
                order_index: index
            }));
            await supabaseAdmin.from('course_group_items').insert(itemsToInsert);
        }
        return { message: 'Courses in group updated successfully.' };
    },
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: async ({ payload, supabaseAdmin }) => {
        const { group_id, department } = payload;
        if (!group_id || !department) {
            throw { status: 400, message: 'group_id and department are required.' };
        }
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
        if (!material_id) throw { status: 400, message: 'Material ID is required.' };
        // Убрали удаление из storage
        await supabaseAdmin.from('course_materials').delete().eq('id', material_id);
        return { message: 'Material deleted successfully.' };
    },
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: async ({ payload, supabaseAdmin }) => {
        const { metrics } = payload;
        if (!metrics) throw { status: 400, message: 'Metrics object is required.' };
        const { error } = await supabaseAdmin.from('leaderboard_settings').upsert({ id: 1, metrics, updated_at: new Date().toISOString() });
        if (error) throw error;
        return { message: 'Leaderboard settings saved.' };
    },
    [ACTIONS.ASSIGN_COURSE_TO_USER]: async ({ payload, supabaseAdmin }) => {
        const { user_email, course_id } = payload;
        if (!user_email || !course_id) throw { status: 400, message: 'User email and course ID are required.' };

        // Use the new, efficient RPC function to get a single user by email.
        const { data: user, error: rpcError } = await supabaseAdmin
            .rpc('get_user_by_email', { user_email })
            .single();

        if (rpcError) {
            console.error(`Error fetching user by email ${user_email}:`, rpcError);
            throw { status: 500, message: 'Failed to retrieve user.' };
        }

        if (!user) {
            throw { status: 404, message: `User with email ${user_email} not found.` };
        }

        // Now that we have the user ID, assign the course.
        const { error: insertError } = await supabaseAdmin
            .from('user_progress')
            .insert({ user_id: user.id, course_id: course_id });

        if (insertError) {
            // Handle cases where the assignment already exists (unique constraint violation)
            if (insertError.code === '23505') {
                return { message: `Course already assigned to ${user_email}.` };
            }
            throw insertError;
        }

        return { message: `Course assigned to ${user_email}.` };
    },
    [ACTIONS.TEXT_TO_SPEECH]: async ({ payload }) => {
        const { text, course_id } = payload;
        if (!text || !course_id) throw { status: 400, message: 'Text and course_id are required for TTS.' };
        try {
            const ttsResponse = await axios.post(TTS_SERVICE_URL, { text, course_id });
            return { audioUrl: ttsResponse.data.url };
        } catch (ttsError) {
            console.error('Error calling Python TTS service:', ttsError);
            throw new Error('Failed to generate audio summary.');
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
    // ЗАМЕНИТЬ UPLOAD_COURSE_MATERIAL на ЭТОТ КОД
    [ACTIONS.ADD_COURSE_MATERIAL]: async ({ payload, supabaseAdmin }) => {
        const { course_id, file_name, file_url } = payload;
        if (!course_id || !file_name || !file_url) {
            throw { status: 400, message: 'Missing required fields for material.' };
        }
        // Простая валидация URL
        if (!file_url.startsWith('http://') && !file_url.startsWith('https://')) {
            throw { status: 400, message: 'Please provide a valid URL.' };
        }
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
    const { action, ...payload } = req.body;
    const handler = adminActionHandlers[action];

    if (!handler) {
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    try {
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
        console.error(`Error processing action "${action}":`, error);
        const status = error.status || 500;
        const message = error.message || 'An internal server error occurred.';
        res.status(status).json({ error: message });
    }
};

module.exports = {
    handleAdminAction
};
