-- Create project_evaluations table for storing analysis results
CREATE TABLE IF NOT EXISTS project_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  project_name TEXT,
  platform_id TEXT NOT NULL,
  creatives JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_evaluations_project_id ON project_evaluations(project_id);

-- Enable Row Level Security
ALTER TABLE project_evaluations ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust based on your auth needs)
DROP POLICY IF EXISTS "Allow all operations" ON project_evaluations;
CREATE POLICY "Allow all operations" ON project_evaluations
  FOR ALL USING (true) WITH CHECK (true);

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

-- Allow all operations (adjust based on your auth needs)
DROP POLICY IF EXISTS "Allow all operations on evaluation_jobs" ON evaluation_jobs;
CREATE POLICY "Allow all operations on evaluation_jobs" ON evaluation_jobs
  FOR ALL USING (true) WITH CHECK (true);

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
CREATE POLICY "Allow all operations on platform_configs" ON platform_configs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on brand_configs" ON brand_configs;
CREATE POLICY "Allow all operations on brand_configs" ON brand_configs
  FOR ALL USING (true) WITH CHECK (true);
