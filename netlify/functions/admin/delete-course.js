const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, course_id } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        // RLS policy allows admin to delete from user_progress.
        const { error: progressError } = await supabase.from('user_progress').delete().eq('course_id', course_id);
        if (progressError) throw new Error('Failed to delete user progress for the course.');

        const { error: courseError } = await supabase.from('courses').delete().eq('course_id', course_id);
        if (courseError) throw new Error('Failed to delete the course.');

        return { statusCode: 200, body: JSON.stringify({ message: `Course ${course_id} and all related progress have been successfully deleted.` }) };
    } catch (error) {
        return handleError(error, 'delete-course');
    }
};
