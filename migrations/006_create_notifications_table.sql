-- Миграция для создания таблицы уведомлений
-- Дата: 2025-09-03

CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Включаем RLS для безопасности
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Политика: Пользователи могут видеть только свои собственные уведомления.
CREATE POLICY "Allow individual user to see their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- Политика: Пользователи могут помечать свои уведомления как прочитанные.
CREATE POLICY "Allow individual user to update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS 'Хранит внутриигровые уведомления для пользователей.';
COMMENT ON COLUMN public.notifications.user_id IS 'Пользователь, которому адресовано уведомление.';
COMMENT ON COLUMN public.notifications.message IS 'Текст уведомления.';
COMMENT ON COLUMN public.notifications.is_read IS 'Прочитано ли уведомление пользователем.';

-- SELECT 'Миграция для таблицы уведомлений успешно подготовлена.';
