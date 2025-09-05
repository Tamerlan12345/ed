const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        // Correctly initialize Supabase client with user's auth token
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // Verify the user is authenticated. RLS will handle role-based access.
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // The RPC function 'get_all_users_with_profiles' implicitly joins on user_profiles.
        // The RLS policy "Allow admin to see all profiles" will be enforced by Supabase.
        // If the user is not an admin, the query will return limited or empty data based on the policy.
        // We rely on RLS to secure the data, removing the insecure role check from the function body.
        const { data, error } = await supabase.rpc('get_all_users_with_profiles');

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        // If RLS denies access, Supabase might return an error which will be caught here.
        return handleError(error, 'get-all-users');
    }
};
