const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { course_id } = JSON.parse(event.body);

        if (!course_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required.' }) };
        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // RLS policies on 'user_progress' and 'courses' will handle authorization.
        // Note: This requires RLS policies allowing admins to DELETE from both tables.

        const { error: progressError } = await supabase.from('user_progress').delete().eq('course_id', course_id);
        if (progressError) throw new Error(`Failed to delete user progress: ${progressError.message}`);

        const { error: courseError } = await supabase.from('courses').delete().eq('course_id', course_id);
        if (courseError) throw new Error(`Failed to delete the course: ${courseError.message}`);

        return { statusCode: 200, body: JSON.stringify({ message: `Course ${course_id} and all related progress have been successfully deleted.` }) };
    } catch (error) {
        return handleError(error, 'delete-course');
    }
};
