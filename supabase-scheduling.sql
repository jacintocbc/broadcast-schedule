-- Scheduling: Venues, Staff, Schedule Blocks
-- Run this in the Supabase SQL Editor after the main migration.

-- ============================================
-- Schedule Venues (grid columns)
-- ============================================

CREATE TABLE IF NOT EXISTS schedule_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Staff (reference table for schedule block assignments)
-- ============================================

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Schedule Blocks
-- ============================================

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date DATE NOT NULL,
  venue_id UUID NOT NULL REFERENCES schedule_venues(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  field_crew BOOLEAN NOT NULL DEFAULT false,
  panel_tech BOOLEAN NOT NULL DEFAULT false,
  panel_talent BOOLEAN NOT NULL DEFAULT false,
  unicamx1 BOOLEAN NOT NULL DEFAULT false,
  unicamx2 BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT schedule_blocks_valid_time_range CHECK (end_time > start_time)
);

-- ============================================
-- Schedule Block Staff (junction)
-- ============================================

CREATE TABLE IF NOT EXISTS schedule_block_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_block_id UUID NOT NULL REFERENCES schedule_blocks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(schedule_block_id, staff_id)
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date_venue ON schedule_blocks(schedule_date, venue_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_schedule_date ON schedule_blocks(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedule_block_staff_block ON schedule_block_staff(schedule_block_id);
CREATE INDEX IF NOT EXISTS idx_schedule_block_staff_staff ON schedule_block_staff(staff_id);

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE TRIGGER update_schedule_venues_updated_at
  BEFORE UPDATE ON schedule_venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedule_blocks_updated_at
  BEFORE UPDATE ON schedule_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Schedule Venues (reference grid columns)
-- ============================================

INSERT INTO schedule_venues (key, label, sort_order) VALUES
  ('HKY_1_RC_MH1', 'HKY 1 RC MH1', 1),
  ('HKY_1_CBC_MH1', 'HKY 1 CBC MH1', 2),
  ('HKY_2_RC_MH2', 'HKY 2 RC MH2', 3),
  ('HKY_2_CBC_MH2', 'HKY 2 CBC MH2', 4),
  ('FIG_SKATE_STRACK_ALL_MSK', 'Fig/Skate/S.Track ALL MSK', 5),
  ('LONG_TRACK_ALL_MSS', 'Long Track ALL MSS', 6),
  ('CURLING_ALL_CCU', 'Curling ALL CCU', 7),
  ('MILANO_DUOMO_LIVE_MCH', 'Milano Duomo Live MCH', 8),
  ('MILANO_DUOMO_STUDIO_MCH', 'Milano Duomo Studio MCH', 9),
  ('LIVIGNO_DAVID_LIVE_LCH', 'Livigno David Live LCH', 10),
  ('LIVIGNO_DAVID_STUDIO_LCH', 'Livigno David Studio LCH', 11)
ON CONFLICT (key) DO NOTHING;
