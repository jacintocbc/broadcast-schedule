-- Add type column to blocks table for event type classification
-- Run this in Supabase SQL Editor

ALTER TABLE blocks
ADD COLUMN IF NOT EXISTS type TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_blocks_type ON blocks(type);

-- Add constraint to ensure type is one of the valid values
ALTER TABLE blocks
DROP CONSTRAINT IF EXISTS valid_block_type;

ALTER TABLE blocks
ADD CONSTRAINT valid_block_type 
CHECK (
  type IS NULL OR type IN (
    'PRELIM',
    'PRELIM NOT FOR STREAM',
    'FINAL/MEDAL',
    'FINAL/MEDAL NOT FOR STREAM',
    'NEW',
    'CEREMONY',
    'OTHER',
    'TRAINING SESSION',
    'PRESS CONFERENCE',
    'BEAUTY CAMERA',
    'OBS HIGHLIGHT SHOW',
    'R-C STREAM ONLY'
  )
);
