const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { metrics } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { error } = await supabase.from('leaderboard_settings').upsert({ setting_key: 'metrics', setting_value: metrics });
        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: 'Настройки лидерборда сохранены.' }) };
    } catch (error) {
        return handleError(error, 'save-leaderboard-settings');
    }
};
