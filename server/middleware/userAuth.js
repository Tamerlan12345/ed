const { createSupabaseClient } = require('../lib/supabaseClient');

/**
 * Middleware to authenticate a regular user.
 * It verifies the JWT from the Authorization header.
 * If successful, it attaches a user-specific Supabase client (`req.supabase`)
 * and the user object (`req.user`) to the request object.
 */
const userAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header is missing or badly formatted.' });
    }
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }

    // Attach the user-specific client and user object to the request for controllers to use
    req.supabase = supabase;
    req.user = user;

    next();
};

module.exports = userAuthMiddleware;
