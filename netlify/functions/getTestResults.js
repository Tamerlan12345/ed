const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

exports.handler = async (event) => {
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        const authHeader = event.headers.authorization;
        if (!authHeader) throw new Error('Authorization header is missing.');
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
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
