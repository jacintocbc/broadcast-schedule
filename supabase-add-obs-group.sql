-- Add obs_group column to blocks table to store DX channel from OBS events
ALTER TABLE blocks
ADD COLUMN IF NOT EXISTS obs_group TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_blocks_obs_group ON blocks(obs_group);
