-- Luge Live Data Table
-- Stores parsed Luge DT_RESULT data (eventName, lastUpdated, runs) for viewing on deployed app.
-- Run this in the Supabase SQL Editor. Sync from local when backend has LUG folder access.

CREATE TABLE IF NOT EXISTS lug_live_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lug_live_data_event_code ON lug_live_data(event_code);
