const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            return handleError('Требуется токен авторизации.', 401);
        }

        // Create a Supabase client with the user's token to make RLS work
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // Check if the user has the 'admin' role
        const { data: roles, error: rolesError } = await supabase.rpc('get_my_roles');
        if (rolesError || !roles.includes('admin')) {
            // Using handleError here for consistency, though it currently returns a generic 500.
            // This will be improved in the next task.
            return { statusCode: 403, body: JSON.stringify({ error: 'У вас нет прав для выполнения этой операции.' }) };
        }

        const { user_email, date, course_id } = JSON.parse(event.body);

        let query = supabase.from('user_progress').select('*');

        if (user_email) {
            query = query.ilike('user_email', `%${user_email}%`);
        }
        if (course_id) {
            query = query.eq('course_id', course_id);
        }
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 1);
            query = query.gte('completed_at', startDate.toISOString()).lt('completed_at', endDate.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        console.error('Error fetching test results:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch test results.' }) };
    }
};
