-- ##############################################
-- # Финальный Сводный Скрипт Схемы для Supabase #
-- ##############################################

-- =========
-- # ТАБЛИЦЫ #
-- =========

CREATE TABLE public.users (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NULL,
    department text NULL,
    is_admin boolean DEFAULT false NOT NULL -- DEPRECATED: Will be removed in favor of JWT claims
);

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    description text NULL,
    presentation_url text NULL,
    content jsonb NULL,
    status text DEFAULT 'draft'::text NOT NULL, -- 'draft', 'published', 'archived'
    draft_content jsonb NULL, -- Для автосохранения черновиков
    is_visible boolean DEFAULT false NOT NULL -- Видимость в каталоге
);

CREATE TABLE public.course_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    public_url text NULL
);

CREATE TABLE public.user_progress (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone NULL,
    score integer NULL,
    percentage numeric NULL,
    attempts integer DEFAULT 0 NOT NULL,
    time_spent_seconds integer DEFAULT 0 NOT NULL,
    deadline_date timestamp with time zone NULL, -- Дедлайн для прохождения
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb NULL,
    last_error text NULL
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL
);

CREATE TABLE public.leaderboard_settings (
    id integer PRIMARY KEY DEFAULT 1,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metrics jsonb NOT NULL,
    CONSTRAINT leaderboard_settings_singleton CHECK (id = 1)
);

CREATE TABLE public.simulation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scenario text NOT NULL,
    persona text NOT NULL,
    evaluation jsonb NULL
);

CREATE TABLE public.course_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_name text NOT NULL,
    is_for_new_employees boolean DEFAULT false NOT NULL,
    start_date date NULL,
    recurrence_period integer NULL, -- Период в месяцах
    enforce_order boolean DEFAULT false NOT NULL, -- Принудительный порядок прохождения
    deadline_days integer NULL, -- Срок на прохождение в днях
    is_visible boolean DEFAULT false NOT NULL -- Видимость в каталоге
);

CREATE TABLE public.course_group_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.course_groups(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    order_index integer DEFAULT 0 NOT NULL, -- Порядковый номер в группе
    CONSTRAINT unique_course_in_group UNIQUE (group_id, course_id)
);

CREATE TABLE public.group_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid NOT NULL REFERENCES public.course_groups(id) ON DELETE CASCADE,
    department text NOT NULL,
    CONSTRAINT unique_department_assignment UNIQUE (group_id, department)
);

-- ===========
-- # ФУНКЦИИ #
-- ===========

-- НОВАЯ, БЕЗОПАСНАЯ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ПРАВ АДМИНИСТРАТОРА ЧЕРЕЗ JWT
CREATE OR REPLACE FUNCTION public.is_claims_admin()
RETURNS boolean AS $$
BEGIN
  -- Эта функция проверяет наличие 'admin' в пользовательских ролях внутри JWT.
  -- Это безопаснее, так как JWT не может быть изменен на стороне клиента.
  -- Для назначения админа используйте: supabase.auth.admin.updateUserById(user_id, { user_metadata: { role: 'admin' } })
  RETURN auth.jwt()->>'role' = 'service_role' OR (auth.jwt()->'user_metadata'->>'role')::text = 'admin';
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  group_record RECORD;
  course_record RECORD;
  deadline_val TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Insert user into public.users table, capturing department from metadata
  INSERT INTO public.users (id, full_name, department)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'department');

  -- Assign courses from groups marked for new employees
  FOR group_record IN
    SELECT id, deadline_days FROM public.course_groups WHERE is_for_new_employees = true AND is_visible = true
  LOOP
    -- Calculate deadline if specified
    IF group_record.deadline_days IS NOT NULL THEN
      deadline_val := now() + (group_record.deadline_days || ' days')::interval;
    ELSE
      deadline_val := NULL;
    END IF;

    -- Insert into user_progress for each course in the group for the new user
    INSERT INTO public.user_progress (user_id, course_id, deadline_date)
    SELECT new.id, ci.course_id, deadline_val
    FROM public.course_group_items ci
    WHERE ci.group_id = group_record.id
    ON CONFLICT (user_id, course_id) DO NOTHING; -- Avoid errors if the user is somehow already assigned the course
  END LOOP;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION public.increment_time_spent(p_course_id uuid, p_user_id uuid, p_seconds_spent integer)
RETURNS void AS $$
BEGIN
  UPDATE public.user_progress
  SET time_spent_seconds = time_spent_seconds + p_seconds_spent
  WHERE user_id = p_user_id AND course_id = p_course_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_all_users_with_details()
RETURNS TABLE(id uuid, full_name text, department text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
      u.id,
      u.full_name,
      u.department,
      au.email
  FROM
      public.users AS u
  JOIN
      auth.users AS au ON u.id = au.id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_by_email(user_email text)
RETURNS TABLE(id uuid, full_name text, department text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
      u.id,
      u.full_name,
      u.department,
      au.email
  FROM
      public.users AS u
  JOIN
      auth.users AS au ON u.id = au.id
  WHERE
      au.email = user_email;
END;
$$;

-- ============
-- # ТРИГГЕРЫ #
-- ============

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- # БЕЗОПАСНОСТЬ НА УРОВНЕ СТРОК (RLS) #
-- ==========================================

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
ALTER TABLE public.group_assignments ENABLE ROW LEVEL SECURITY;

-- ОБНОВЛЕННЫЕ ПОЛИТИКИ
CREATE POLICY "Enable read access for user on their own user record" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Enable read access for visible and published courses" ON public.courses FOR SELECT USING (auth.role() = 'authenticated' AND status = 'published'::text AND is_visible = true);
CREATE POLICY "Enable access for users based on user_id" ON public.user_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable access for users based on user_id" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable access for users based on user_id" ON public.simulation_results FOR ALL USING (auth.uid() = user_id);

-- ИСПОЛЬЗУЕМ is_claims_admin() ВМЕСТО is_admin()
CREATE POLICY "Admins have full access to users" ON public.users FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to courses" ON public.courses FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to course materials" ON public.course_materials FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to user_progress" ON public.user_progress FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to background_jobs" ON public.background_jobs FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to notifications" ON public.notifications FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to leaderboard_settings" ON public.leaderboard_settings FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to simulation_results" ON public.simulation_results FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to course groups" ON public.course_groups FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to course group items" ON public.course_group_items FOR ALL USING (public.is_claims_admin());
CREATE POLICY "Admins have full access to group assignments" ON public.group_assignments FOR ALL USING (public.is_claims_admin());

-- Политики для аутентифицированных пользователей остаются без изменений
CREATE POLICY "Authenticated users can read visible course groups" ON public.course_groups FOR SELECT USING (auth.role() = 'authenticated' AND is_visible = true);
CREATE POLICY "Authenticated users can read course group items" ON public.course_group_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read group assignments" ON public.group_assignments FOR SELECT USING (auth.role() = 'authenticated');
