-- Миграция для создания RPC функции для получения всех пользователей с их профилями
-- Причина: Вложенный select в Supabase может быть хрупким.
-- Решение: Заменить его на явный LEFT JOIN внутри RPC функции для большей надежности.

CREATE OR REPLACE FUNCTION get_all_users_with_profiles()
RETURNS TABLE (
    id UUID,
    email TEXT,
    full_name TEXT,
    department TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', 'N/A') as full_name,
        COALESCE(p.department, 'N/A') as department
    FROM
        auth.users u
    LEFT JOIN
        public.user_profiles p ON u.id = p.id
    WHERE
        u.role = 'authenticated'; -- or whatever role your users have
END;
$$ LANGUAGE plpgsql;
