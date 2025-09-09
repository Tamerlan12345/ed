-- Миграция для исправления внешнего ключа в таблице user_progress
-- Дата: 2025-09-09

-- Проблема: Внешний ключ user_progress.user_id ссылался на auth.users(id),
-- что приводило к ошибкам целостности данных, когда запись в public.users отсутствовала.
-- Решение: Перенаправить внешний ключ на public.users(id), сделав эту таблицу
-- единственным источником правды для бизнес-логики.

-- Шаг 1: Удалить существующий некорректный constraint.
-- IF EXISTS используется для предотвращения ошибки, если constraint уже был удален.
ALTER TABLE public.user_progress
DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;

-- Шаг 2: Создать новый, корректный constraint, который ссылается на public.users.
-- ON DELETE CASCADE сохраняется, чтобы при удалении пользователя из public.users
-- его прогресс также был удален.
ALTER TABLE public.user_progress
ADD CONSTRAINT user_progress_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- SELECT 'Миграция для исправления внешнего ключа user_progress успешно подготовлена.';
