-- Миграция для добавления отслеживания времени, затраченного на курс
-- Дата: 2025-09-04

-- Добавляем колонку time_spent_seconds в таблицу user_progress
ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;

-- Добавляем комментарий для новой колонки
COMMENT ON COLUMN public.user_progress.time_spent_seconds IS 'Общее время в секундах, затраченное пользователем на изучение материалов курса.';

-- SELECT 'Миграция для добавления time_spent_seconds успешно подготовлена.';
