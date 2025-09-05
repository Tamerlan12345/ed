-- Миграция для добавления ON DELETE CASCADE к таблицам, связанным с пользователями
-- Дата: 2025-09-05

-- Шаг 1: Добавление внешнего ключа с ON DELETE CASCADE для user_progress
-- Это гарантирует, что при удалении пользователя из auth.users, все его записи о прогрессе будут также удалены.

-- Сначала удаляем старый constraint, если он существует, чтобы избежать конфликтов.
-- Имя constraint может отличаться, поэтому лучше проверить его в вашей БД.
-- Здесь мы предполагаем, что constraint не был создан или имеет стандартное имя.
ALTER TABLE public.user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;

ALTER TABLE public.user_progress
ADD CONSTRAINT user_progress_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- Шаг 2: Добавление внешнего ключа с ON DELETE CASCADE для user_roles
-- Это гарантирует, что при удалении пользователя, его роли также будут удалены.
-- В миграции 027 мы уже создали REFERENCES, но без ON DELETE CASCADE.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

-- SELECT 'Миграция для добавления ON DELETE CASCADE успешно подготовлена.';
