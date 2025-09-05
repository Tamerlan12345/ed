const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { user, roles } = JSON.parse(event.body);

        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { data, error } = await supabase.from('courses').select('*');
        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return handleError(error, 'get-courses');
    }
};
