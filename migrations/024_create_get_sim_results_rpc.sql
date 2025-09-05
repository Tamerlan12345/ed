-- Миграция для создания RPC функции для получения результатов симуляции с данными пользователя
-- Причина: Текущая реализация делает 3 отдельных запроса, что неэффективно.
-- Решение: Создать единую функцию, которая объединяет данные на стороне БД.

CREATE OR REPLACE FUNCTION get_simulation_results_with_user_data()
RETURNS TABLE (
    id INT,
    user_id UUID,
    scenario TEXT,
    persona TEXT,
    evaluation JSONB,
    created_at TIMESTAMPTZ,
    user_email TEXT,
    full_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ds.id,
        ds.user_id,
        ds.scenario,
        ds.persona,
        ds.evaluation,
        ds.created_at,
        u.email as user_email,
        COALESCE(p.full_name, u.email) as full_name
    FROM
        public.dialogue_simulations ds
    LEFT JOIN
        auth.users u ON ds.user_id = u.id
    LEFT JOIN
        public.user_profiles p ON ds.user_id = p.id
    ORDER BY
        ds.created_at DESC;
END;
$$ LANGUAGE plpgsql;
