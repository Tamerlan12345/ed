CREATE TABLE public.background_jobs (
    job_id UUID PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result JSONB,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id),
    related_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row modification
CREATE TRIGGER set_background_jobs_updated_at
BEFORE UPDATE ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Enable RLS
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- Policies for background_jobs
-- Users can view their own jobs.
CREATE POLICY "Allow users to view their own jobs"
ON public.background_jobs
FOR SELECT
USING (auth.uid() = created_by);

-- Service roles (like our background functions) can insert/update jobs.
CREATE POLICY "Allow service roles to insert new jobs"
ON public.background_jobs
FOR INSERT
WITH CHECK (true); -- Simplified for service role access

CREATE POLICY "Allow service roles to update jobs"
ON public.background_jobs
FOR UPDATE
USING (true); -- Simplified for service role access
