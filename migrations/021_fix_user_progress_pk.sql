-- Step 1: Add the new user_id column (nullable for now)
ALTER TABLE public.user_progress ADD COLUMN user_id UUID;

-- Step 2: Populate the new user_id from the auth.users table
-- This assumes that every email in user_progress exists in auth.users
UPDATE public.user_progress
SET user_id = (SELECT id FROM auth.users WHERE auth.users.email = public.user_progress.user_email)
WHERE user_id IS NULL;

-- Step 3: Drop the old primary key
-- The name of the constraint might be different, check with \d user_progress in psql
-- Common default name is user_progress_pkey
ALTER TABLE public.user_progress DROP CONSTRAINT IF EXISTS user_progress_pkey;

-- Step 4: Make user_id NOT NULL now that it's populated
ALTER TABLE public.user_progress ALTER COLUMN user_id SET NOT NULL;

-- Step 5: Create the new composite primary key
ALTER TABLE public.user_progress ADD PRIMARY KEY (user_id, course_id);

-- Step 6: Create an index on user_email for potential lookups if still needed
CREATE INDEX IF NOT EXISTS idx_user_progress_user_email ON public.user_progress(user_email);

-- Optional: To keep user_email in sync with auth.users, you could implement a trigger.
-- For now, we assume the application logic will handle this.

COMMENT ON COLUMN public.user_progress.user_id IS 'Foreign key to auth.users.id. Part of the new composite primary key.';
COMMENT ON COLUMN public.user_progress.user_email IS 'Email of the user. Kept for convenience but no longer part of the primary key.';
