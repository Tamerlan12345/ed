-- Этот файл содержит SQL-команды для УДАЛЕНИЯ всех объектов базы данных,
-- созданных миграционными скриптами.
--
-- ВНИМАНИЕ: Выполнение этого скрипта приведет к ПОЛНОЙ И БЕЗВОЗВРАТНОЙ ПОТЕРЕ ДАННЫХ
-- в таблицах, связанных с курсами, прогрессом пользователей, группами и т.д.
--
-- Назначение миграционных файлов (*.sql в папке /migrations) - это версионирование
-- структуры базы данных. Они позволяют последовательно применять изменения и откатывать их,
-- а также настраивать базу данных с нуля на новых серверах. Удалять их из проекта
-- не рекомендуется, так как это нарушит процесс разработки и развертывания.

-- Шаг 1: Удаление триггеров
DROP TRIGGER IF EXISTS on_new_user_created ON auth.users;

-- Шаг 2: Удаление функций
DROP FUNCTION IF EXISTS public.auto_assign_courses_to_new_user();
DROP FUNCTION IF EXISTS public.get_detailed_report_data(text, text, text);
DROP FUNCTION IF EXISTS public.get_my_email();
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.get_simulation_results();
DROP FUNCTION IF EXISTS public.get_weekly_leaderboard(text);
DROP FUNCTION IF EXISTS public.increment_time_spent(text, integer);

-- Шаг 3: Удаление таблиц
-- Порядок важен для соблюдения внешних ключей
DROP TABLE IF EXISTS public.group_assignments;
DROP TABLE IF EXISTS public.course_group_items; -- (не было в списке, но должно существовать)
DROP TABLE IF EXISTS public.course_groups;
DROP TABLE IF EXISTS public.user_progress;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.course_materials;
DROP TABLE IF EXISTS public.leaderboard_settings;
DROP TABLE IF EXISTS public.dialogue_simulations;
DROP TABLE IF EXISTS public.courses;
DROP TABLE IF EXISTS public.user_profiles;

-- Шаг 4: Удаление хранилища (Storage Bucket)
-- Обратите внимание: API Supabase может не позволить удалить бакет через SQL,
-- если он не пуст. Это может потребовать ручного удаления через интерфейс Supabase.
-- Команда ниже является плейсхолдером, так как прямое удаление бакета через SQL не стандартно.
-- SELECT 'Для удаления бакета "course-materials" используйте панель управления Supabase.';

-- SELECT 'Все объекты базы данных, созданные миграциями, были удалены.';
