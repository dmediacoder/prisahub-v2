-- Run this SQL in your Supabase SQL editor to set up the database

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  organisation    TEXT,
  location        TEXT,
  salary          TEXT,
  contract        TEXT,
  pattern         TEXT,
  posted          TEXT,
  closing         TEXT,
  url             TEXT,
  category        TEXT,
  band            INTEGER,
  hasSponsor      BOOLEAN DEFAULT FALSE,
  isFullTime      BOOLEAN DEFAULT FALSE,
  isPartTime      BOOLEAN DEFAULT FALSE,
  isPermanent     BOOLEAN DEFAULT FALSE,
  isFixedTerm     BOOLEAN DEFAULT FALSE,
  workingPattern  TEXT,
  enriched        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast category queries
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_posted   ON jobs(posted DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_enriched ON jobs(enriched);

-- Enable Row Level Security but allow public reads
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON jobs
  FOR SELECT USING (true);

CREATE POLICY "Allow service insert/update" ON jobs
  FOR ALL USING (true);
