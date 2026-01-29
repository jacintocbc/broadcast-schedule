-- Add 'NOT FOR BROADCAST' to valid_block_type (used by frontend BLOCK_TYPES)
-- Run this in Supabase SQL Editor if you get: violates check constraint "valid_block_type"

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
    'NOT FOR BROADCAST',
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
