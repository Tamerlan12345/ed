-- ##############################################
-- # Финальный Сводный Скрипт Схемы для Supabase #
-- ##############################################

-- Этот скрипт содержит все необходимые таблицы, функции, триггеры
-- и политики для воссоздания базы данных с нуля.

-- =========
-- # ТАБЛИЦЫ #
-- =========

-- Таблица пользователей: хранит публичную информацию профиля.
CREATE TABLE public.users (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NULL,
    department text NULL,
    is_admin boolean DEFAULT false NOT NULL
);

-- Таблица курсов: хранит информацию о курсах.
CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    description text NULL,
    content jsonb NULL
);

-- Таблица материалов курса: хранит файлы и ссылки, относящиеся к курсам.
CREATE TABLE public.course_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    public_url text NULL
);

-- Таблица прогресса пользователей: отслеживает прохождение курсов.
CREATE TABLE public.user_progress (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone NULL,
    score integer NULL,
    percentage numeric NULL,
    attempts integer DEFAULT 0 NOT NULL,
    time_spent_seconds integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (user_id, course_id)
);

-- Таблица фоновых задач: для обработки длительных асинхронных операций.
CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb NULL,
    last_error text NULL
);

-- Таблица уведомлений: для уведомлений пользователям.
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL
);

-- Таблица настроек лидерборда: единая таблица для настроек.
CREATE TABLE public.leaderboard_settings (
    id integer PRIMARY KEY DEFAULT 1,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metrics jsonb NOT NULL,
    CONSTRAINT leaderboard_settings_singleton CHECK (id = 1)
);

-- Таблица результатов симулятора: хранит результаты диалогового тренажера.
CREATE TABLE public.simulation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scenario text NOT NULL,
    persona text NOT NULL,
    evaluation jsonb NULL
);

-- Таблица групп курсов: для объединения курсов в блоки.
CREATE TABLE public.course_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_name text NOT NULL,
    is_for_new_employees boolean DEFAULT false NOT NULL,
    start_date date NULL,
    recurrence_period integer NULL -- Период в месяцах
);

-- Таблица элементов групп курсов: связующая таблица для курсов и групп (многие-ко-многим).
CREATE TABLE public.course_group_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.course_groups(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT unique_course_in_group UNIQUE (group_id, course_id)
);


-- ===========
-- # ФУНКЦИИ #
-- ===========

-- Функция для проверки, является ли текущий пользователь администратором.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (SELECT is_admin FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для заполнения таблицы public.users при регистрации нового пользователя.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для получения данных для лидерборда.
DROP FUNCTION IF EXISTS public.get_leaderboard_data();
CREATE OR REPLACE FUNCTION public.get_leaderboard_data()
RETURNS TABLE(user_id uuid, full_name text, total_score bigint, courses_completed bigint) AS $$
BEGIN
  RETURN QUERY
    SELECT
      u.id as user_id,
      u.full_name,
      SUM(up.score)::bigint as total_score,
      COUNT(up.completed_at)::bigint as courses_completed
    FROM
      public.user_progress as up
    JOIN
      public.users as u ON up.user_id = u.id
    GROUP BY
      u.id, u.full_name
    ORDER BY
      total_score DESC, courses_completed DESC;
END;
$$ LANGUAGE plpgsql;

-- Функция для увеличения времени, проведенного в курсе.
CREATE OR REPLACE FUNCTION public.increment_time_spent(p_course_id uuid, p_user_id uuid, p_seconds_spent integer)
RETURNS void AS $$
BEGIN
  UPDATE public.user_progress
  SET time_spent_seconds = time_spent_seconds + p_seconds_spent
  WHERE user_id = p_user_id AND course_id = p_course_id;
END;
$$ LANGUAGE plpgsql;


-- ============
-- # ТРИГГЕРЫ #
-- ============

-- Триггер, вызывающий handle_new_user при создании нового пользователя в auth.users.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ==========================================
-- # БЕЗОПАСНОСТЬ НА УРОВНЕ СТРОК (RLS) #
-- ==========================================

-- --- Включение RLS для всех таблиц ---
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_group_items ENABLE ROW LEVEL SECURITY;

-- --- Политики RLS ---

-- Пользователи могут видеть свои собственные данные.
CREATE POLICY "Enable read access for user on their own user record"
ON public.users FOR SELECT USING (auth.uid() = id);

-- Авторизованные пользователи могут видеть все курсы.
CREATE POLICY "Enable read access for all authenticated users"
ON public.courses FOR SELECT USING (auth.role() = 'authenticated');

-- Пользователи могут управлять своим собственным прогрессом.
CREATE POLICY "Enable access for users based on user_id"
ON public.user_progress FOR ALL USING (auth.uid() = user_id);

-- Пользователи могут управлять своими собственными уведомлениями.
CREATE POLICY "Enable access for users based on user_id"
ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- Пользователи могут управлять своими собственными результатами симулятора.
CREATE POLICY "Enable access for users based on user_id"
ON public.simulation_results FOR ALL USING (auth.uid() = user_id);

-- Администраторы получают полный доступ ко всему.
CREATE POLICY "Admins have full access to users" ON public.users FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to courses" ON public.courses FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to course materials" ON public.course_materials FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to user_progress" ON public.user_progress FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to background_jobs" ON public.background_jobs FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to notifications" ON public.notifications FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to leaderboard_settings" ON public.leaderboard_settings FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to simulation_results" ON public.simulation_results FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to course groups" ON public.course_groups FOR ALL USING (is_admin());
CREATE POLICY "Admins have full access to course group items" ON public.course_group_items FOR ALL USING (is_admin());

-- Авторизованные пользователи могут читать информацию о группах (необходимо для некоторой логики на клиенте).
CREATE POLICY "Authenticated users can read course groups" ON public.course_groups FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read course group items" ON public.course_group_items FOR SELECT USING (auth.role() = 'authenticated');
