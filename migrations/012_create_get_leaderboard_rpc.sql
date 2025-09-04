-- Миграция для создания RPC функции для получения данных лидерборда
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
            user_email,
            SUM(CASE WHEN percentage = 100 THEN 1 ELSE 0 END) as courses_completed_count,
            SUM(time_spent_seconds) as total_seconds,
            AVG(CASE WHEN percentage > 0 THEN percentage ELSE NULL END) as avg_score
        FROM public.user_progress
        WHERE
            -- Учитываем как завершенные, так и обновленные за последнюю неделю
            (completed_at >= now() - interval '7 days') OR (created_at >= now() - interval '7 days')
        GROUP BY user_email
    )
    SELECT
        up.full_name,
        wp.user_email,
        wp.courses_completed_count,
        (wp.total_seconds / 60) as total_time_spent_minutes,
        ROUND(wp.avg_score, 2) as average_score
    FROM weekly_progress wp
    JOIN public.user_profiles up ON wp.user_email = (SELECT email FROM auth.users WHERE id = up.id)
    ORDER BY
        CASE
            WHEN p_order_by = 'courses_completed' THEN wp.courses_completed_count
            WHEN p_order_by = 'time_spent' THEN wp.total_seconds
            WHEN p_order_by = 'avg_score' THEN wp.avg_score
            ELSE wp.courses_completed_count -- Дефолтная сортировка
        END DESC NULLS LAST
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- SELECT 'Миграция для создания RPC функции get_weekly_leaderboard успешно подготовлена.';
