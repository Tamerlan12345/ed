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

    // 2. Check for admin privileges using modern JWT claims.
    // The 'service_role' is a Supabase-internal role for server-to-server calls.
    const isClaimsAdmin = req.user.user_metadata?.role === 'admin';

    if (isClaimsAdmin) {
        req.user = user;
        req.token = token;
        return next();
    }

    // 3. If the JWT check fails, deny access.
    return res.status(403).json({ error: 'Forbidden: User does not have admin privileges.' });
};

module.exports = adminAuthMiddleware;
