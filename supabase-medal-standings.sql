-- Medal Standings Table
-- Stores parsed DT_MEDALS data (top 10 + Canada) for the dashboard.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS medal_standings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
