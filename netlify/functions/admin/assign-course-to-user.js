const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, user_email, course_id } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        if (!user_email || !course_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'user_email and course_id are required.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const { error } = await supabase
            .from('user_progress')
            .upsert({ user_email, course_id }, { onConflict: 'user_email, course_id', ignoreDuplicates: true });

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: `Course ${course_id} assigned to ${user_email}.` }) };
    } catch (error) {
        return handleError(error, 'assign-course-to-user');
    }
};
