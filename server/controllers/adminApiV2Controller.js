const { createSupabaseAdminClient } = require('../lib/supabaseClient');

// Helper function to handle errors consistently
const handleError = (res, error, context) => {
    console.error(`Error in ${context}:`, error);
    const status = error.status || 500;
    const message = error.message || 'An internal server error occurred.';
    res.status(status).json({ error: message });
};

// GET /api/users
const getUsers = async (req, res) => {
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data, error } = await supabaseAdmin.rpc('get_all_users_with_details');
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        handleError(res, error, 'getUsers');
    }
};

// DELETE /api/users/:userId
const deleteUser = async (req, res) => {
    const { userId } = req.params;
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (authError) {
            // If the user is already deleted from auth, Supabase might throw an error.
            // We should ensure the user is also deleted from our public table.
            if (authError.message.toLowerCase().includes('not found')) {
                 const { error: publicError } = await supabaseAdmin.from('users').delete().eq('id', userId);
                 if (publicError) throw publicError;
                 return res.status(200).json({ message: `User ${userId} was already deleted from auth, removed from public users.` });
            }
            throw authError;
        }
        res.status(200).json({ message: `User ${userId} deleted successfully.` });
    } catch (error) {
        handleError(res, error, 'deleteUser');
    }
};

// GET /api/courses
const getCourses = async (req, res) => {
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data, error } = await supabaseAdmin
            .from('courses')
            .select('*, course_group_items(course_groups(group_name))');

        if (error) throw error;

        const coursesWithGroup = data.map(course => {
            const groupItem = course.course_group_items && course.course_group_items.length > 0
                ? course.course_group_items[0] : null;
            const groupName = groupItem && groupItem.course_groups
                ? groupItem.course_groups.group_name : null;
            const newCourse = { ...course };
            delete newCourse.course_group_items;
            newCourse.group_name = groupName;
            return newCourse;
        });

        res.status(200).json(coursesWithGroup);
    } catch (error) {
        handleError(res, error, 'getCourses');
    }
};

// POST /api/courses
const createCourse = async (req, res) => {
    const { title, deadline_days } = req.body;
    try {
        if (!title) {
            return res.status(400).json({ error: 'Title is required to create a course.' });
        }
        const supabaseAdmin = createSupabaseAdminClient();
        const insertData = { title };
        if (deadline_days) {
            insertData.deadline_days = deadline_days;
        }
        const { data, error } = await supabaseAdmin.from('courses').insert(insertData).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        handleError(res, error, 'createCourse');
    }
};

// DELETE /api/courses/:courseId
const deleteCourse = async (req, res) => {
    const { courseId } = req.params;
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        // Cascade delete should handle user_progress, but we can be explicit.
        await supabaseAdmin.from('course_materials').delete().eq('course_id', courseId);
        await supabaseAdmin.from('user_progress').delete().eq('course_id', courseId);
        await supabaseAdmin.from('course_group_items').delete().eq('course_id', courseId);
        const { error } = await supabaseAdmin.from('courses').delete().eq('id', courseId);
        if (error) throw error;
        res.status(200).json({ message: `Course ${courseId} deleted successfully.` });
    } catch (error) {
        handleError(res, error, 'deleteCourse');
    }
};

// GET /api/jobs
const getJobs = async (req, res) => {
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data, error } = await supabaseAdmin
            .from('background_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        handleError(res, error, 'getJobs');
    }
};


module.exports = {
    getUsers,
    deleteUser,
    getCourses,
    createCourse,
    deleteCourse,
    getJobs,
};