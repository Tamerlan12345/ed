const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { data, error } = await supabase.from('leaderboard_settings').select('setting_value').eq('setting_key', 'metrics').single();
        if (error && error.code !== 'PGRST116') throw error;

        return { statusCode: 200, body: JSON.stringify(data?.setting_value || {}) };
    } catch (error) {
        return handleError(error, 'get-leaderboard-settings');
    }
};
