const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, group_name, is_for_new_employees, start_date, recurrence_period } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const { data, error } = await supabase.from('course_groups').insert({
            group_name,
            is_for_new_employees,
            start_date: start_date || null,
            recurrence_period: recurrence_period || null
        }).select().single();

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return handleError(error, 'create-course-group');
    }
};
