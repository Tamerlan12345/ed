-- Миграция для создания RPC функции для безопасного инкремента времени
-- Дата: 2025-09-04

CREATE OR REPLACE FUNCTION increment_time_spent(c_id TEXT, u_email TEXT, seconds INT)
RETURNS void AS $$
  UPDATE public.user_progress
  SET time_spent_seconds = time_spent_seconds + seconds
  WHERE course_id = c_id AND user_email = u_email;
$$ LANGUAGE sql;

-- SELECT 'Миграция для создания RPC функции increment_time_spent успешно подготовлена.';
