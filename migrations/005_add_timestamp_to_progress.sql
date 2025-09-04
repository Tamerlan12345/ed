-- Миграция для добавления временной метки к таблице user_progress
-- Это позволит отслеживать, когда курс был назначен, для отправки напоминаний.
-- Дата: 2025-09-03

ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.user_progress.created_at IS 'Дата назначения курса пользователю.';

-- SELECT 'Миграция для добавления created_at в user_progress успешно подготовлена.';
