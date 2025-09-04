-- Миграция для создания RPC-функции для получения результатов диалогового тренажера
-- Функция будет использоваться в админ-панели для отображения истории симуляций.

CREATE OR REPLACE FUNCTION get_simulation_results()
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMPTZ,
    user_email TEXT,
    full_name TEXT,
    persona TEXT,
    scenario TEXT,
    evaluation JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ds.id,
        ds.created_at,
        u.email as user_email,
        p.full_name,
        ds.persona,
        ds.scenario,
        ds.evaluation
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
