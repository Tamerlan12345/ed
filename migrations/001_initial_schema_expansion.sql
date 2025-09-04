-- Миграция для расширения схемы данных обучающей платформы
-- Дата: 2025-09-03

-- Таблица 1: Профили пользователей
-- Хранит дополнительную информацию о пользователях, не содержащуюся в стандартной auth.users.
-- Связана с auth.users через user_id.
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    department TEXT,
    role TEXT NOT NULL DEFAULT 'сотрудник' -- Возможные значения: 'сотрудник', 'руководитель', 'админ'
);

-- Комментарии для таблицы user_profiles
COMMENT ON TABLE user_profiles IS 'Дополнительные данные профилей пользователей, включая ФИО, подразделение и роль.';
COMMENT ON COLUMN user_profiles.id IS 'Ссылка на ID пользователя в auth.users.';
COMMENT ON COLUMN user_profiles.full_name IS 'Полное имя пользователя.';
COMMENT ON COLUMN user_profiles.department IS 'Подразделение, в котором работает пользователь.';
COMMENT ON COLUMN user_profiles.role IS 'Роль пользователя в системе (сотрудник, руководитель, админ).';


-- Таблица 2: Группы курсов (Блоки)
-- Позволяет администраторам объединять курсы в логические блоки.
CREATE TABLE IF NOT EXISTS course_groups (
    id SERIAL PRIMARY KEY,
    group_name TEXT NOT NULL,
    is_for_new_employees BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Комментарии для таблицы course_groups
COMMENT ON TABLE course_groups IS 'Логические блоки или группы курсов.';
COMMENT ON COLUMN course_groups.group_name IS 'Название блока курсов (например, "Курсы по КАСКО").';
COMMENT ON COLUMN course_groups.is_for_new_employees IS 'Флаг, указывающий, что этот блок должен автоматически назначаться новым сотрудникам.';


-- Таблица 3: Элементы группы курсов
-- Связующая таблица (многие-ко-многим) между курсами и блоками курсов.
CREATE TABLE IF NOT EXISTS course_group_items (
    group_id INTEGER NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, course_id)
);

-- Комментарии для таблицы course_group_items
COMMENT ON TABLE course_group_items IS 'Связь многие-ко-многим между таблицами courses и course_groups.';


-- Таблица 4: Назначения групп
-- Позволяет назначать блоки курсов целым подразделениям.
CREATE TABLE IF NOT EXISTS group_assignments (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Комментарии для таблицы group_assignments
COMMENT ON TABLE group_assignments IS 'Назначение блоков курсов на подразделения.';
COMMENT ON COLUMN group_assignments.department IS 'Название подразделения, которому назначен блок.';

-- Уведомление о завершении
-- (Этот скрипт нужно выполнить в SQL-редакторе вашей панели Supabase)
-- SELECT 'Миграция схемы успешно подготовлена. Примените этот скрипт в вашей базе данных.';
