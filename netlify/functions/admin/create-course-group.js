const { createClient } = require('@supabase/supabase-js');
const { handleError, createError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { group_name, is_for_new_employees, start_date, recurrence_period } = JSON.parse(event.body);

        if (!group_name || group_name.trim() === '') {
            throw createError(400, 'Ошибка валидации', {
                group_name: 'Название группы не может быть пустым.'
            });
        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // RLS policy "Allow admin or editor to manage course groups" will handle authorization.
        const { data, error } = await supabase.from('course_groups').insert({
            group_name,
            is_for_new_employees: is_for_new_employees || false,
            start_date: start_date || null,
            recurrence_period: recurrence_period || null
        }).select().single();

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return handleError(error, 'create-course-group');
    }
};
