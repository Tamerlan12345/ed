const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { group_id, course_ids } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        await supabase.from('course_group_items').delete().eq('group_id', group_id);
        const items = course_ids.map(cid => ({ group_id: group_id, course_id: cid }));
        const { error } = await supabase.from('course_group_items').insert(items);

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: 'Courses in group updated.' }) };
    } catch (error) {
        return handleError(error, 'update-courses-in-group');
    }
};
