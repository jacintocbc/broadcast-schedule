-- OBS schedule updates: ODF merge deltas only (keyed by Es Code).
-- Backend pushes from M: when ODF merge runs. Deployed API loads base from CSV, applies these.
CREATE TABLE IF NOT EXISTS obs_schedule_updates (
  id TEXT PRIMARY KEY DEFAULT 'default',
  updates JSONB NOT NULL DEFAULT '{}',
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE obs_schedule_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all (anon)" ON obs_schedule_updates;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON obs_schedule_updates;
CREATE POLICY "Allow all (anon)" ON obs_schedule_updates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON obs_schedule_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);
