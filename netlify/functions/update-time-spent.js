const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Use the service key here to bypass RLS, as we are updating a specific row based on user identity
    // and don't need complex RLS policies for this simple update.
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { course_id, seconds_spent } = JSON.parse(event.body);
        if (!course_id || typeof seconds_spent !== 'number' || seconds_spent <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'course_id and a positive number of seconds_spent are required' }) };
        }

        // Use an RPC function to safely increment the value.
        // This avoids race conditions where a user might have two tabs open.
        const { error: rpcError } = await supabase.rpc('increment_time_spent', {
            c_id: course_id,
            u_email: user.email,
            seconds: Math.round(seconds_spent) // Ensure we're dealing with an integer
        });

        if (rpcError) {
            console.error('Supabase RPC error:', rpcError);
            return { statusCode: 500, body: JSON.stringify({ error: 'Could not update time spent.' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Time updated successfully.' })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
