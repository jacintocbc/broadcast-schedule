-- Snowboard Live Data Table
-- Stores parsed SBD DT_RESULT data (scored events: halfpipe, slopestyle, big air) for viewing on deployed app.
-- Run this in the Supabase SQL Editor. Sync from local when backend has SBD folder access.

CREATE TABLE IF NOT EXISTS sbd_live_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sbd_live_data_event_code ON sbd_live_data(event_code);
