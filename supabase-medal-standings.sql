-- Medal Standings Table
-- Stores parsed DT_MEDALS data (top 10, with Canada always in slot 10 if outside top 10) for the dashboard.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS medal_standings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE medal_standings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all (anon)" ON medal_standings;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON medal_standings;
CREATE POLICY "Allow all (anon)" ON medal_standings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON medal_standings FOR ALL TO authenticated USING (true) WITH CHECK (true);
