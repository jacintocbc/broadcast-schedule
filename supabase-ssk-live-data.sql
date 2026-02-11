-- Speed Skating Live Data Table
-- Stores parsed SSK DT_RESULT data (eventName, lastUpdated, runs) for viewing on deployed app.
-- Run this in the Supabase SQL Editor. Sync from local when backend has SSK folder access.

CREATE TABLE IF NOT EXISTS ssk_live_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssk_live_data_event_code ON ssk_live_data(event_code);
