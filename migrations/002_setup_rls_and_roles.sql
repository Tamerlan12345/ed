-- Миграция для настройки прав доступа (RBAC) и безопасности на уровне строк (RLS)
-- Дата: 2025-09-03

-- Шаг 1: Создание вспомогательных функций для RLS
-- Эти функции будут использоваться в политиках RLS для определения роли и email текущего пользователя.

-- Функция для получения роли текущего аутентифицированного пользователя.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role
    FROM public.user_profiles
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для получения email текущего пользователя.
-- auth.email() может быть не всегда доступен в зависимости от контекста, поэтому создаем свою надежную функцию.
CREATE OR REPLACE FUNCTION get_my_email()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT email
    FROM auth.users
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Шаг 2: Включение RLS для ключевых таблиц
-- Включаем защиту для таблиц. После этого никто не сможет получить доступ к данным без явной политики.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY; -- Защищаем на случай, если есть неопубликованные курсы
ALTER TABLE public.course_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_assignments ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики, если они существуют, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Allow individual user to see their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow admin/manager to see all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow individual user to see their own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Allow admin/manager to see all progress" ON public.user_progress;
DROP POLICY IF EXISTS "Allow authenticated users to see published courses" ON public.courses;
DROP POLICY IF EXISTS "Allow admin/manager to see all courses" ON public.courses;
DROP POLICY IF EXISTS "Allow admin/manager to manage groups and assignments" ON public.course_groups;
DROP POLICY IF EXISTS "Allow admin/manager to manage groups and assignments" ON public.group_assignments;


-- Шаг 3: Создание политик RLS

-- Политики для user_profiles
CREATE POLICY "Allow individual user to see their own profile"
ON public.user_profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Allow admin/manager to see all profiles"
ON public.user_profiles FOR SELECT
USING (get_my_role() IN ('админ', 'руководитель'));


-- Политики для user_progress
CREATE POLICY "Allow individual user to see their own progress"
ON public.user_progress FOR SELECT
USING (get_my_email() = user_email);

CREATE POLICY "Allow admin/manager to see all progress"
ON public.user_progress FOR SELECT
USING (get_my_role() IN ('админ', 'руководитель'));


-- Политики для courses
CREATE POLICY "Allow authenticated users to see published courses"
ON public.courses FOR SELECT
USING (status = 'published');

CREATE POLICY "Allow admin/manager to see all courses"
ON public.courses FOR SELECT
USING (get_my_role() IN ('админ', 'руководитель'));


-- Политики для управления группами
-- Только администраторы и руководители могут видеть группы и назначения
CREATE POLICY "Allow admin/manager to manage groups and assignments"
ON public.course_groups FOR ALL
USING (get_my_role() IN ('админ', 'руководитель'))
WITH CHECK (get_my_role() IN ('админ', 'руководитель'));

CREATE POLICY "Allow admin/manager to manage groups and assignments"
ON public.group_assignments FOR ALL
USING (get_my_role() IN ('админ', 'руководитель'))
WITH CHECK (get_my_role() IN ('админ', 'руководитель'));


-- SELECT 'Миграция RLS и ролей успешно подготовлена. Примените этот скрипт в вашей базе данных.';
