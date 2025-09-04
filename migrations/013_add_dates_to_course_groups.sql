-- Миграция для добавления дат и периодичности в группы курсов
-- Дата: 2025-09-04

ALTER TABLE public.course_groups
ADD COLUMN start_date DATE,
ADD COLUMN recurrence_period INTEGER;

COMMENT ON COLUMN public.course_groups.start_date IS 'Конкретная дата, когда группа курсов становится активной или назначается.';
COMMENT ON COLUMN public.course_groups.recurrence_period IS 'Период повторения в месяцах (например, 1, 3, 6, 12). NULL или 0 означает отсутствие повторения.';
