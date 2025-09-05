-- Миграция для исправления отчета get_detailed_report_data
-- Причина: Фильтр по department падал, если у пользователя не было профиля (prof.department IS NULL).
-- Решение: Использовать COALESCE для замены NULL на пустую строку перед фильтрацией.

CREATE OR REPLACE FUNCTION get_detailed_report_data(
    user_email_filter TEXT DEFAULT NULL,
    department_filter TEXT DEFAULT NULL,
    course_id_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
    user_email TEXT,
    percentage INT,
    completed_at TIMESTAMPTZ,
    time_spent_seconds INT,
    courses JSON,
    user_profiles JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        up.user_email,
        up.percentage,
        up.completed_at,
        up.time_spent_seconds,
        json_build_object('title', c.title) as courses,
        json_build_object('full_name', prof.full_name, 'department', prof.department) as user_profiles
    FROM
        public.user_progress up
    LEFT JOIN
        public.courses c ON up.course_id = c.course_id
    LEFT JOIN
        auth.users u ON up.user_email = u.email
    LEFT JOIN
        public.user_profiles prof ON u.id = prof.id
    WHERE
        (user_email_filter IS NULL OR up.user_email ILIKE ('%' || user_email_filter || '%')) AND
        -- Fix: Use COALESCE to prevent error when department is NULL
        (department_filter IS NULL OR COALESCE(prof.department, '') ILIKE ('%' || department_filter || '%')) AND
        (course_id_filter IS NULL OR up.course_id = course_id_filter);
END;
$$ LANGUAGE plpgsql;
