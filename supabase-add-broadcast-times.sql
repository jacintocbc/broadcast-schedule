-- Add broadcast_start_time and broadcast_end_time to blocks table
-- Run this in Supabase SQL Editor

ALTER TABLE blocks 
ADD COLUMN IF NOT EXISTS broadcast_start_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS broadcast_end_time TIMESTAMP;

-- Add constraint to ensure broadcast times are valid if provided
ALTER TABLE blocks
DROP CONSTRAINT IF EXISTS valid_broadcast_time_range;

ALTER TABLE blocks
ADD CONSTRAINT valid_broadcast_time_range 
CHECK (
  (broadcast_start_time IS NULL AND broadcast_end_time IS NULL) OR
  (broadcast_start_time IS NOT NULL AND broadcast_end_time IS NOT NULL AND broadcast_end_time > broadcast_start_time)
);
