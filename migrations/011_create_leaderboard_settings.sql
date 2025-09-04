-- Миграция для создания таблицы настроек лидерборда
-- Дата: 2025-09-04

CREATE TABLE IF NOT EXISTS public.leaderboard_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Комментарий для таблицы
COMMENT ON TABLE public.leaderboard_settings IS 'Хранит настройки для функции "Топ учеников", например, выбранные метрики.';

-- Включаем RLS, но разрешаем чтение всем, так как эти настройки не являются секретными.
-- Только администраторы смогут их изменять.
ALTER TABLE public.leaderboard_settings ENABLE ROW LEVEL SECURITY;

-- Политика: Все аутентифицированные пользователи могут читать настройки.
CREATE POLICY "Allow all authenticated users to read settings"
ON public.leaderboard_settings FOR SELECT
USING (auth.role() = 'authenticated');

-- Политика: Только администраторы могут изменять настройки.
CREATE POLICY "Allow admins to update settings"
ON public.leaderboard_settings FOR ALL
USING (get_my_role() = 'админ')
WITH CHECK (get_my_role() = 'админ');

-- Вставляем дефолтные значения, чтобы таблица не была пустой
INSERT INTO public.leaderboard_settings (setting_key, setting_value)
VALUES ('metrics', '{"courses_completed": true, "time_spent": false, "avg_score": false}')
ON CONFLICT (setting_key) DO NOTHING;

-- SELECT 'Миграция для таблицы leaderboard_settings успешно подготовлена.';
