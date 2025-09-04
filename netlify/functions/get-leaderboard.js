const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    // This function can be called by any authenticated user.
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        // Authenticate the user making the request
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // 1. Get the current leaderboard settings
        const { data: settings, error: settingsError } = await supabase
            .from('leaderboard_settings')
            .select('setting_value')
            .eq('setting_key', 'metrics')
            .single();

        if (settingsError) {
            console.error('Could not fetch leaderboard settings:', settingsError);
            // Don't fail, just use defaults
        }

        // Determine the sorting metric. Default to 'courses_completed'.
        // Find the first metric that is set to true.
        const metrics = settings?.setting_value?.metrics || { courses_completed: true };
        let orderBy = 'courses_completed'; // Default sort order
        const validMetrics = ['courses_completed', 'time_spent', 'avg_score'];

        for (const metric of validMetrics) {
            if (metrics[metric]) {
                orderBy = metric;
                break; // Use the first enabled metric for sorting
            }
        }

        // 2. Call the RPC function to get the leaderboard data
        const { data: leaderboardData, error: rpcError } = await supabase.rpc('get_weekly_leaderboard', {
            p_order_by: orderBy
        });

        if (rpcError) {
            console.error('Error calling get_weekly_leaderboard RPC:', rpcError);
            throw new Error('Could not retrieve leaderboard data.');
        }

        return {
            statusCode: 200,
            body: JSON.stringify(leaderboardData)
        };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
