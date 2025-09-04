-- Миграция для добавления счетчика попыток в таблицу user_progress
-- Это позволит ограничить количество раз, которое пользователь может пройти тест.
-- Дата: 2025-09-03

ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_progress.attempts IS 'Количество попыток сдачи теста.';

-- SELECT 'Миграция для добавления attempts в user_progress успешно подготовлена.';
