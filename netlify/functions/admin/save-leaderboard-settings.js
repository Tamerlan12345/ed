const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, metrics } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const { error } = await supabase.from('leaderboard_settings').upsert({ setting_key: 'metrics', setting_value: metrics });
        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: 'Настройки лидерборда сохранены.' }) };
    } catch (error) {
        return handleError(error, 'save-leaderboard-settings');
    }
};
