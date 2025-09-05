const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, group_id } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const { data, error } = await supabase.from('course_groups').select('*, course_group_items(course_id)').eq('id', group_id).single();

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return handleError(error, 'get-group-details');
    }
};
