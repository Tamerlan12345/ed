-- Миграция для обновления таблицы dialogue_simulations
-- 1. Добавляет колонку 'scenario' для хранения текста сценария.
-- 2. Изменяет тип колонки 'evaluation' с TEXT на JSONB для хранения структурированных оценок.

-- Добавляем новую колонку для сценария
ALTER TABLE public.dialogue_simulations
ADD COLUMN scenario TEXT;

COMMENT ON COLUMN public.dialogue_simulations.scenario IS 'Текст сценария, по которому проходила симуляция.';

-- Изменяем тип колонки evaluation на JSONB
-- Используем USING to_jsonb(evaluation::text) для безопасного преобразования существующих данных.
-- Если evaluation пустой или null, он станет null в JSONB.
ALTER TABLE public.dialogue_simulations
ALTER COLUMN evaluation TYPE JSONB USING to_jsonb(evaluation::text);

COMMENT ON COLUMN public.dialogue_simulations.evaluation IS 'Структурированная оценка диалога в формате JSON, предоставленная ИИ.';
