-- Миграция для удаления столбца product_line из таблицы courses
-- Это часть задачи по удалению функционала "Продуктовая линейка".
-- Дата: 2025-09-04

ALTER TABLE public.courses DROP COLUMN IF EXISTS product_line;

-- SELECT 'Столбец product_line успешно удален из таблицы courses.';
