const { createSupabaseClient } = require('../lib/supabaseClient');

const adminAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];

    // Используем единый клиент, созданный для конкретного пользователя
    const supabase = createSupabaseClient(token);

    // 1. Проверяем, валиден ли токен вообще
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }

    // 2. Вызываем безопасную серверную функцию для проверки прав администратора
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_claims_admin');

    if (rpcError) {
        console.error('Error calling is_claims_admin RPC:', rpcError);
        return res.status(500).json({ error: 'Failed to verify admin privileges.' });
    }

    if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: User does not have admin privileges.' });
    }

    // 3. Если всё в порядке, передаем данные дальше
    req.user = user;
    req.token = token; // Pass token for background jobs
    next();
};

module.exports = adminAuthMiddleware;
