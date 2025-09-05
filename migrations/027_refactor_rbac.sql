-- Миграция для рефакторинга системы контроля доступа на основе ролей (RBAC)
-- Дата: 2025-09-05

-- Шаг 1: Удаление старой колонки 'role' из таблицы user_profiles
-- Это изменение является частью перехода к более гибкой системе с отдельной таблицей ролей.
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS role;


-- Шаг 2: Создание таблицы для хранения ролей
-- Эта таблица будет содержать все возможные роли в системе.
CREATE TABLE IF NOT EXISTS public.roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- Комментарии для таблицы roles
COMMENT ON TABLE public.roles IS 'Справочник ролей пользователей в системе.';
COMMENT ON COLUMN public.roles.name IS 'Уникальное имя роли (например, admin, editor, viewer).';

-- Наполняем таблицу ролями
INSERT INTO public.roles (name) VALUES ('admin'), ('editor'), ('viewer')
ON CONFLICT (name) DO NOTHING;


-- Шаг 3: Создание связующей таблицы user_roles
-- Эта таблица устанавливает связь многие-ко-многим между пользователями и ролями.
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Комментарии для таблицы user_roles
COMMENT ON TABLE public.user_roles IS 'Связь между пользователями и их ролями.';


-- Шаг 4: Обновление вспомогательной функции для получения ролей пользователя
-- Старая функция get_my_role() возвращала одну роль. Новая функция get_my_roles() будет возвращать массив ролей.
DROP FUNCTION IF EXISTS get_my_role(); -- Удаляем старую функцию
CREATE OR REPLACE FUNCTION get_my_roles()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT r.name
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии для функции get_my_roles
COMMENT ON FUNCTION get_my_roles() IS 'Возвращает массив текстовых названий ролей для текущего аутентифицированного пользователя.';


-- Шаг 5: Обновление существующих политик RLS для использования новой системы ролей
-- Мы заменим проверки get_my_role() IN ('админ', 'руководитель') на проверки наличия ролей в массиве, возвращаемом get_my_roles().

-- Политики для user_profiles
DROP POLICY IF EXISTS "Allow admin/manager to see all profiles" ON public.user_profiles;
CREATE POLICY "Allow admin to see all profiles"
ON public.user_profiles FOR SELECT
USING ('admin' = ANY(get_my_roles()));


-- Политики для user_progress
DROP POLICY IF EXISTS "Allow admin/manager to see all progress" ON public.user_progress;
CREATE POLICY "Allow admin, editor or viewer to see progress"
ON public.user_progress FOR SELECT
USING (ARRAY['admin', 'editor', 'viewer'] && get_my_roles());


-- Политики для courses
DROP POLICY IF EXISTS "Allow admin/manager to see all courses" ON public.courses;
CREATE POLICY "Allow admin or editor to see all courses"
ON public.courses FOR SELECT
USING (ARRAY['admin', 'editor'] && get_my_roles());

-- Политики для course_groups
DROP POLICY IF EXISTS "Allow admin/manager to manage groups and assignments" ON public.course_groups;
CREATE POLICY "Allow admin or editor to manage course groups"
ON public.course_groups FOR ALL
USING (ARRAY['admin', 'editor'] && get_my_roles())
WITH CHECK (ARRAY['admin', 'editor'] && get_my_roles());


-- Политики для group_assignments
DROP POLICY IF EXISTS "Allow admin/manager to manage groups and assignments" ON public.group_assignments;
CREATE POLICY "Allow admin or editor to manage group assignments"
ON public.group_assignments FOR ALL
USING (ARRAY['admin', 'editor'] && get_my_roles())
WITH CHECK (ARRAY['admin', 'editor'] && get_my_roles());


-- Политики для dialogue_simulations
DROP POLICY IF EXISTS "Allow admin/manager to see all simulation results" ON public.dialogue_simulations;
CREATE POLICY "Allow admin, editor or viewer to see simulation results"
ON public.dialogue_simulations FOR SELECT
USING (ARRAY['admin', 'editor', 'viewer'] && get_my_roles());


-- SELECT 'Миграция для рефакторинга RBAC успешно подготовлена.';
