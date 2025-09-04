-- Миграция для создания таблицы сопутствующих материалов курса
-- Позволит прикреплять файлы (памятки, презентации) к курсам.
-- Дата: 2025-09-03

CREATE TABLE IF NOT EXISTS public.course_materials (
    id SERIAL PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE, -- Путь к файлу в Supabase Storage
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Включаем RLS
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

-- Политика: Все аутентифицированные пользователи могут видеть/скачивать материалы опубликованных курсов.
-- Мы делаем JOIN с таблицей courses для проверки статуса.
CREATE POLICY "Allow authenticated users to see materials for published courses"
ON public.course_materials FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.courses
        WHERE courses.course_id = course_materials.course_id AND courses.status = 'published'
    )
);

-- Политика: Администраторы могут управлять всеми материалами.
CREATE POLICY "Allow admin to manage all materials"
ON public.course_materials FOR ALL
USING (get_my_role() = 'админ')
WITH CHECK (get_my_role() = 'админ');


COMMENT ON TABLE public.course_materials IS 'Сопутствующие файлы для курсов.';
COMMENT ON COLUMN public.course_materials.course_id IS 'Курс, к которому относится материал.';
COMMENT ON COLUMN public.course_materials.file_name IS 'Отображаемое имя файла.';
COMMENT ON COLUMN public.course_materials.storage_path IS 'Уникальный путь к файлу в бакете Supabase Storage.';

-- SELECT 'Миграция для таблицы course_materials успешно подготовлена.';
