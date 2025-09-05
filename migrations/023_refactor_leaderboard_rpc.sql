-- Миграция для рефакторинга и повышения надежности RPC функции get_weekly_leaderboard
-- Причина: Усложненный ORDER BY может вызывать проблемы с NULL значениями.
-- Решение: Добавить COALESCE в ORDER BY для безопасной сортировки.

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
            -- Ensure counts and sums are not null
            COALESCE(COUNT(CASE WHEN p.percentage = 100 THEN 1 END), 0) as courses_completed_count,
            COALESCE(SUM(p.time_spent_seconds), 0) as total_seconds,
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
        ROUND(COALESCE(wp.avg_score_val, 0), 2) AS average_score
    FROM weekly_progress wp
    LEFT JOIN auth.users u ON wp.user_email = u.email
    LEFT JOIN public.user_profiles up ON u.id = up.id
    ORDER BY
        CASE
            -- Use COALESCE to handle potential NULLs gracefully during sorting
            WHEN p_order_by = 'courses_completed' THEN COALESCE(wp.courses_completed_count, 0)
            WHEN p_order_by = 'time_spent' THEN COALESCE(wp.total_seconds, 0)
            WHEN p_order_by = 'avg_score' THEN COALESCE(wp.avg_score_val, 0)
            ELSE COALESCE(wp.courses_completed_count, 0)
        END DESC NULLS LAST
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;
