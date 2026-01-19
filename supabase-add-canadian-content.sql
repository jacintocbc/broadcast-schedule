-- Add canadian_content column to blocks table
ALTER TABLE blocks
ADD COLUMN IF NOT EXISTS canadian_content BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_blocks_canadian_content ON blocks(canadian_content);
