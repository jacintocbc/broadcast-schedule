-- Enable Row Level Security (RLS) on all tables exposed to PostgREST and add permissive policies.
-- This satisfies Supabase's RLS recommendation while allowing full access for proof of concept.
-- Run this in the Supabase SQL Editor.
--
-- For production you would replace these with restrictive policies (e.g. by user/tenant).
-- If a policy already exists, drop it first or run the DROP section once then the CREATE section.

-- ============================================
-- Reference tables
-- ============================================
ALTER TABLE commentators ENABLE ROW LEVEL SECURITY;
ALTER TABLE producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE encoders ENABLE ROW LEVEL SECURITY;
ALTER TABLE booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE networks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all (anon)" ON commentators;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON commentators;
CREATE POLICY "Allow all (anon)" ON commentators FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON commentators FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON producers;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON producers;
CREATE POLICY "Allow all (anon)" ON producers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON producers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON encoders;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON encoders;
CREATE POLICY "Allow all (anon)" ON encoders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON encoders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON booths;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON booths;
CREATE POLICY "Allow all (anon)" ON booths FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON booths FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON suites;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON suites;
CREATE POLICY "Allow all (anon)" ON suites FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON suites FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON networks;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON networks;
CREATE POLICY "Allow all (anon)" ON networks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON networks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Blocks and junction tables
-- ============================================
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_commentators ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_networks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all (anon)" ON blocks;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON blocks;
CREATE POLICY "Allow all (anon)" ON blocks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON block_commentators;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON block_commentators;
CREATE POLICY "Allow all (anon)" ON block_commentators FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON block_commentators FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON block_booths;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON block_booths;
CREATE POLICY "Allow all (anon)" ON block_booths FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON block_booths FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all (anon)" ON block_networks;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON block_networks;
CREATE POLICY "Allow all (anon)" ON block_networks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON block_networks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Planning
-- ============================================
ALTER TABLE planning ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all (anon)" ON planning;
DROP POLICY IF EXISTS "Allow all (authenticated)" ON planning;
CREATE POLICY "Allow all (anon)" ON planning FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all (authenticated)" ON planning FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Live event data (optional - comment out if table doesn't exist)
-- ============================================
-- ALTER TABLE live_event_data ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Allow all (anon)" ON live_event_data;
-- DROP POLICY IF EXISTS "Allow all (authenticated)" ON live_event_data;
-- CREATE POLICY "Allow all (anon)" ON live_event_data FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all (authenticated)" ON live_event_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
