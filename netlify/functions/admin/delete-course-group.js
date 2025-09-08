const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { group_id } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { error } = await supabase.from('course_groups').delete().eq('id', group_id);

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: `Group ${group_id} deleted.` }) };
    } catch (error) {
        return handleError(error, 'delete-course-group');
    }
};
