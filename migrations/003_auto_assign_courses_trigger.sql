-- Миграция для создания триггера автоматического назначения курсов новым пользователям
-- Дата: 2025-09-03

-- Шаг 1: Создание функции, которая будет выполняться триггером.
-- Эта функция находит все курсы в группах, помеченных как "для новых сотрудников",
-- и добавляет их в таблицу user_progress для нового пользователя.

CREATE OR REPLACE FUNCTION public.handle_new_user_courses()
RETURNS TRIGGER AS $$
DECLARE
    group_id_to_assign INT;
    course_id_to_assign TEXT;
BEGIN
    -- Проходимся по всем группам, которые помечены как "для новых сотрудников"
    FOR group_id_to_assign IN
        SELECT id FROM public.course_groups WHERE is_for_new_employees = TRUE
    LOOP
        -- Для каждой такой группы, проходимся по всем курсам в ней
        FOR course_id_to_assign IN
            SELECT course_id FROM public.course_group_items WHERE group_id = group_id_to_assign
        LOOP
            -- Добавляем запись в user_progress.
            -- Мы предполагаем, что у пользователя еще нет прогресса по этому курсу.
            -- ON CONFLICT DO NOTHING предотвращает ошибку, если вдруг такая запись уже существует.
            INSERT INTO public.user_progress (user_email, course_id, score, total_questions, percentage, completed_at)
            VALUES (NEW.email, course_id_to_assign, 0, 0, 0, NULL)
            ON CONFLICT (user_email, course_id) DO NOTHING;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Шаг 2: Создание самого триггера
-- Этот триггер будет вызывать функцию handle_new_user_courses()
-- каждый раз после добавления новой записи в таблицу auth.users.

-- Сначала удаляем старый триггер, если он существует, чтобы избежать дублирования
DROP TRIGGER IF EXISTS on_auth_user_created_assign_courses ON auth.users;

CREATE TRIGGER on_auth_user_created_assign_courses
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_courses();

-- SELECT 'Миграция для триггера авто-назначения курсов успешно подготовлена.';
