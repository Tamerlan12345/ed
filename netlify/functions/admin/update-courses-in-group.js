const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, group_id, course_ids } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        await supabase.from('course_group_items').delete().eq('group_id', group_id);
        const items = course_ids.map(cid => ({ group_id: group_id, course_id: cid }));
        const { error } = await supabase.from('course_group_items').insert(items);

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: 'Courses in group updated.' }) };
    } catch (error) {
        return handleError(error, 'update-courses-in-group');
    }
};
