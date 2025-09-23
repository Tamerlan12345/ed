const { createClient } = require('@supabase/supabase-js');

// In a test environment, the keys might not be set, and the client will be mocked anyway.
if (process.env.NODE_ENV !== 'test') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('Supabase environment variables (URL, ANON_KEY, SERVICE_KEY) are not configured.');
    }
}

/**
 * Creates a Supabase client for a specific user, using their auth token.
 * @param {string} token The user's JWT.
 * @returns A Supabase client instance authenticated for the user.
 */
const createSupabaseClient = (token) => {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
};

/**
 * Creates a Supabase client with admin privileges (service_role).
 * This client bypasses RLS and should be used only in trusted server-side environments.
 * @returns A Supabase admin client instance.
 */
const createSupabaseAdminClient = () => {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        db: { schema: 'public' }
    });
};

module.exports = {
    createSupabaseClient,
    createSupabaseAdminClient,
};
