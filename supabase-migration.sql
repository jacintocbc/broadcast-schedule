-- Broadcast Resource Scheduler Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- Reference Tables (Simple name-only dropdowns)
-- ============================================

CREATE TABLE commentators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE producers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE encoders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Blocks Table (Main editable entities)
-- ============================================

CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  block_id TEXT UNIQUE, -- Custom ID (editable)
  obs_id TEXT, -- OBS ID (editable)
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration INTERVAL, -- Can be calculated from start/end or stored
  -- Single relationships (one per block)
  encoder_id UUID REFERENCES encoders(id) ON DELETE SET NULL,
  producer_id UUID REFERENCES producers(id) ON DELETE SET NULL,
  suite_id UUID REFERENCES suites(id) ON DELETE SET NULL,
  -- Optional: Link to original CSV event for reference
  source_event_id TEXT, -- References the ID from CSV events (if created from event)
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ============================================
-- Junction Tables (Multiple relationships)
-- ============================================

-- Blocks can have multiple commentators
CREATE TABLE block_commentators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  commentator_id UUID NOT NULL REFERENCES commentators(id) ON DELETE CASCADE,
  role TEXT, -- Optional: "Lead", "Color", etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(block_id, commentator_id)
);

-- Blocks can have multiple booths
CREATE TABLE block_booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  booth_id UUID NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(block_id, booth_id)
);

-- Blocks can have multiple networks
CREATE TABLE block_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(block_id, network_id)
);

-- ============================================
-- Live XML Data Table (Optional)
-- ============================================

CREATE TABLE live_event_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
  -- Store raw XML or parsed data
  xml_data JSONB, -- Store parsed XML as JSON
  xml_raw TEXT, -- Store raw XML if needed
  -- Common fields extracted from XML
  status TEXT, -- "live", "upcoming", "completed"
  current_score TEXT,
  period TEXT,
  time_remaining TEXT,
  -- Any other live data fields
  metadata JSONB, -- Flexible storage for additional fields
  -- Timestamps
  ingested_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Network drive reference
  xml_file_path TEXT, -- Path to XML file on network drive
  xml_file_modified TIMESTAMP -- Last modified time of XML file
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Blocks indexes
CREATE INDEX idx_blocks_encoder ON blocks(encoder_id);
CREATE INDEX idx_blocks_producer ON blocks(producer_id);
CREATE INDEX idx_blocks_suite ON blocks(suite_id);
CREATE INDEX idx_blocks_start_time ON blocks(start_time);
CREATE INDEX idx_blocks_end_time ON blocks(end_time);
CREATE INDEX idx_blocks_block_id ON blocks(block_id);

-- Junction table indexes
CREATE INDEX idx_block_commentators_block ON block_commentators(block_id);
CREATE INDEX idx_block_commentators_commentator ON block_commentators(commentator_id);
CREATE INDEX idx_block_booths_block ON block_booths(block_id);
CREATE INDEX idx_block_booths_booth ON block_booths(booth_id);
CREATE INDEX idx_block_networks_block ON block_networks(block_id);
CREATE INDEX idx_block_networks_network ON block_networks(network_id);

-- Live data indexes
CREATE INDEX idx_live_event_data_block ON live_event_data(block_id);
CREATE INDEX idx_live_event_data_status ON live_event_data(status);

-- ============================================
-- Functions for updated_at timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_commentators_updated_at BEFORE UPDATE ON commentators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_producers_updated_at BEFORE UPDATE ON producers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_encoders_updated_at BEFORE UPDATE ON encoders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booths_updated_at BEFORE UPDATE ON booths FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suites_updated_at BEFORE UPDATE ON suites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_networks_updated_at BEFORE UPDATE ON networks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blocks_updated_at BEFORE UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_live_event_data_updated_at BEFORE UPDATE ON live_event_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
