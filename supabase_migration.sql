-- Create project_evaluations table for storing analysis results
CREATE TABLE IF NOT EXISTS project_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  evaluation_job_id TEXT,
  platform_id TEXT NOT NULL,
  creatives JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: switch from one-row-per-project to one-row-per-evaluation-run
ALTER TABLE project_evaluations
  DROP CONSTRAINT IF EXISTS project_evaluations_project_id_key;

ALTER TABLE project_evaluations
  ADD COLUMN IF NOT EXISTS evaluation_job_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_evaluations_project_id ON project_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_evaluations_updated_at ON project_evaluations(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_evaluations_evaluation_job_id ON project_evaluations(evaluation_job_id);

-- Enable Row Level Security
ALTER TABLE project_evaluations ENABLE ROW LEVEL SECURITY;

-- Domain gate used by RLS. Supabase Auth includes the signed-in user's email in
-- auth.jwt(), and the client rejects non-Rocketium accounts as well.
CREATE OR REPLACE FUNCTION public.is_rocketium_auth_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@rocketium.com';
$$;

-- Only authenticated Rocketium users can access saved project evaluations.
DROP POLICY IF EXISTS "Allow all operations" ON project_evaluations;
DROP POLICY IF EXISTS "Rocketium users can manage project evaluations" ON project_evaluations;
CREATE POLICY "Rocketium users can manage project evaluations" ON project_evaluations
  FOR ALL TO authenticated
  USING (public.is_rocketium_auth_user())
  WITH CHECK (public.is_rocketium_auth_user());

-- Migration: Add project_name column if table already exists
-- Run this if you have an existing table without project_name:
-- ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS project_name TEXT;

-- ===============================================
-- Evaluation Jobs table for shareable analysis links
-- ===============================================

CREATE TABLE IF NOT EXISTS evaluation_jobs (
  id TEXT PRIMARY KEY,  -- Shareable ID like "eval-abc123-xyz789"
  project_id TEXT NOT NULL,
  project_name TEXT,
  platform_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
  total_creatives INTEGER NOT NULL DEFAULT 0,
  analyzed_creatives INTEGER NOT NULL DEFAULT 0,
  creatives JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_project_id ON evaluation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_status ON evaluation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_created_at ON evaluation_jobs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE evaluation_jobs ENABLE ROW LEVEL SECURITY;

-- Direct table access is private. Public preview links are served through the
-- get-evaluation edge function, which fetches one requested job with service role.
DROP POLICY IF EXISTS "Allow all operations on evaluation_jobs" ON evaluation_jobs;
DROP POLICY IF EXISTS "Rocketium users can manage evaluation_jobs" ON evaluation_jobs;
CREATE POLICY "Rocketium users can manage evaluation_jobs" ON evaluation_jobs
  FOR ALL TO authenticated
  USING (public.is_rocketium_auth_user())
  WITH CHECK (public.is_rocketium_auth_user());

-- Enable realtime for this table (required for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE evaluation_jobs;

-- Migration: add metadata column for newer combined-source jobs
ALTER TABLE evaluation_jobs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ===============================================
-- Config tables for platform + brand rules
-- ===============================================

CREATE TABLE IF NOT EXISTS platform_configs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_configs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on platform_configs" ON platform_configs;
DROP POLICY IF EXISTS "Rocketium users can manage platform_configs" ON platform_configs;
CREATE POLICY "Rocketium users can manage platform_configs" ON platform_configs
  FOR ALL TO authenticated
  USING (public.is_rocketium_auth_user())
  WITH CHECK (public.is_rocketium_auth_user());

DROP POLICY IF EXISTS "Allow all operations on brand_configs" ON brand_configs;
DROP POLICY IF EXISTS "Rocketium users can manage brand_configs" ON brand_configs;
CREATE POLICY "Rocketium users can manage brand_configs" ON brand_configs
  FOR ALL TO authenticated
  USING (public.is_rocketium_auth_user())
  WITH CHECK (public.is_rocketium_auth_user());
