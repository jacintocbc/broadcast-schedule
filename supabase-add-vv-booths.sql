-- Add VV booths (same logic as VIS/VOBS: shared, always available, excluded from Live Booths)
-- Run this in Supabase SQL Editor

INSERT INTO booths (name) VALUES
  ('VV MH2'),
  ('VV MH1'),
  ('VV MOS')
ON CONFLICT (name) DO NOTHING;
