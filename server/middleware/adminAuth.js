const { createSupabaseClient, createSupabaseAdminClient } = require('../lib/supabaseClient');

const adminAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);

    // 1. Get user data from the token
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }

    // 2. Check for admin privileges using modern JWT claims first.
    const isClaimsAdmin = user.role === 'service_role' || user.user_metadata?.role === 'admin';

    if (isClaimsAdmin) {
        req.user = user;
        req.token = token;
        return next();
    }

    // 3. Fallback for older accounts: Check the deprecated 'is_admin' column.
    // We use the admin client here to bypass RLS and read the users table.
    console.log(`User ${user.id} is not a claims admin. Checking is_admin column as a fallback.`);
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data: legacyAdminCheck, error: dbError } = await supabaseAdmin
            .from('users')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (dbError) {
            // This could happen if the user record doesn't exist in public.users yet.
            console.error('Error checking legacy admin flag:', dbError);
            return res.status(500).json({ error: 'Failed to verify admin privileges due to a database error.' });
        }

        if (legacyAdminCheck && legacyAdminCheck.is_admin) {
            console.log(`Granting admin access to ${user.id} based on legacy is_admin flag.`);
            req.user = user;
            req.token = token;
            return next();
        }
    } catch (e) {
        console.error('Unhandled exception during legacy admin check:', e);
        return res.status(500).json({ error: 'An unexpected error occurred while verifying admin privileges.' });
    }

    // 4. If neither check passes, deny access.
    return res.status(403).json({ error: 'Forbidden: User does not have admin privileges.' });
};

module.exports = adminAuthMiddleware;
