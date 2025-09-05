const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { group_id, group_name, is_for_new_employees, start_date, recurrence_period } = JSON.parse(event.body);

        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { data, error } = await supabase.from('course_groups').update({
            group_name,
            is_for_new_employees,
            start_date: start_date || null,
            recurrence_period: recurrence_period || null
        }).eq('id', group_id).select().single();

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return handleError(error, 'update-course-group');
    }
};
