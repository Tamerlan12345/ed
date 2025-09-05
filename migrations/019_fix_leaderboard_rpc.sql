-- Миграция для исправления RPC функции get_weekly_leaderboard
-- Исправляет проблему, из-за которой пользователи без профиля не отображались в лидерборде.
-- Дата: 2025-09-04

CREATE OR REPLACE FUNCTION get_weekly_leaderboard(p_order_by TEXT)
RETURNS TABLE (
    full_name TEXT,
    user_email TEXT,
    courses_completed BIGINT,
    total_time_spent_minutes BIGINT,
    average_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH weekly_progress AS (
        SELECT
            p.user_email,
            COUNT(CASE WHEN p.percentage = 100 THEN 1 END) as courses_completed_count,
            SUM(p.time_spent_seconds) as total_seconds,
            AVG(CASE WHEN p.percentage > 0 THEN p.percentage ELSE NULL END) as avg_score_val
        FROM public.user_progress p
        WHERE
            p.updated_at >= now() - interval '7 days'
        GROUP BY p.user_email
    )
    SELECT
        COALESCE(up.full_name, wp.user_email) AS full_name,
        wp.user_email,
        wp.courses_completed_count AS courses_completed,
        (wp.total_seconds / 60) AS total_time_spent_minutes,
        ROUND(wp.avg_score_val, 2) AS average_score
    FROM weekly_progress wp
    LEFT JOIN auth.users u ON wp.user_email = u.email
    LEFT JOIN public.user_profiles up ON u.id = up.id
    ORDER BY
        CASE
            WHEN p_order_by = 'courses_completed' THEN wp.courses_completed_count
            WHEN p_order_by = 'time_spent' THEN wp.total_seconds
            WHEN p_order_by = 'avg_score' THEN wp.avg_score_val
            ELSE wp.courses_completed_count
        END DESC NULLS LAST
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- SELECT 'Миграция для исправления RPC функции get_weekly_leaderboard успешно подготовлена.';
