ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS last_slide_index integer DEFAULT 0;
