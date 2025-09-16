const { createClient } = require('@supabase/supabase-js');

// This is a simplified version of the one in server/index.js
// It is here to avoid circular dependencies.
const createSupabaseClient = (token) => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        throw new Error('Supabase URL or Anon Key is not configured.');
    }
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
};

const adminAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminCheck, error: adminCheckError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (adminCheckError || !adminCheck?.is_admin) {
        return res.status(403).json({ error: 'Forbidden: User is not an admin.' });
    }

    req.user = user;
    req.token = token; // Pass token for background jobs
    next();
};

module.exports = adminAuthMiddleware;
