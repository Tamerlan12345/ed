const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { group_id, department } = JSON.parse(event.body);

        if (!group_id || !department) {
            return { statusCode: 400, body: JSON.stringify({ error: 'group_id and department are required.' }) };
        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // RLS policy "Allow admin or editor to manage group assignments" will handle authorization.
        const { error } = await supabase.from('group_assignments').insert({ group_id, department });

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: `Group assigned to ${department}.` }) };
    } catch (error) {
        return handleError(error, 'assign-group-to-department');
    }
};
