-- Allow the same booth to be used for multiple networks within the same block
-- This migration adds a network_id to block_booths to link each booth to a specific network
-- The unique constraint is on (block_id, network_id) so each network can have one booth
-- This allows the same booth to be used for different networks (different network_id values)

-- Step 1: Add network_id column to block_booths
ALTER TABLE block_booths
ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES networks(id) ON DELETE CASCADE;

-- Step 2: Remove the old unique constraint
ALTER TABLE block_booths
DROP CONSTRAINT IF EXISTS block_booths_block_id_booth_id_key;

-- Step 3: Add new unique constraint on (block_id, network_id)
-- This ensures each network has only one booth per block, but allows same booth for different networks
ALTER TABLE block_booths
ADD CONSTRAINT block_booths_block_network_unique 
UNIQUE(block_id, network_id);

-- Step 4: Create index for performance
CREATE INDEX IF NOT EXISTS idx_block_booths_network ON block_booths(network_id);

-- Step 5: Migrate existing data (optional - for existing records)
-- If there are existing block_booths without network_id, we can try to match them
-- This is a best-effort migration - existing records without network matches will need manual fixing
-- NOTE: If you get duplicate key errors, you may need to clean up existing data first
-- See supabase-cleanup-blocks.sql for a cleanup script

DO $$
DECLARE
  booth_record RECORD;
  network_record RECORD;
  network_labels TEXT[] := ARRAY['CBC TV', 'CBC Gem', 'R-C TV/WEB'];
  network_index INT := 0;
  booth_count INT;
  network_count INT;
BEGIN
  -- First, check if there are any conflicts
  -- Count booths and networks per block
  FOR booth_record IN 
    SELECT bb.block_id, COUNT(*) as booth_count
    FROM block_booths bb
    WHERE bb.network_id IS NULL
    GROUP BY bb.block_id
  LOOP
    SELECT COUNT(*) INTO network_count
    FROM block_networks
    WHERE block_id = booth_record.block_id;
    
    -- If we have more booths than networks, we can't match them all
    -- Skip this block and log a warning
    IF booth_record.booth_count > network_count THEN
      RAISE NOTICE 'Block % has % booths but only % networks - skipping migration for this block', 
        booth_record.block_id, booth_record.booth_count, network_count;
      CONTINUE;
    END IF;
  END LOOP;
  
  -- For each block_booth without a network_id, try to match it to a network by index
  FOR booth_record IN 
    SELECT bb.id, bb.block_id, bb.booth_id, 
           ROW_NUMBER() OVER (PARTITION BY bb.block_id ORDER BY bb.created_at) as booth_order
    FROM block_booths bb
    WHERE bb.network_id IS NULL
  LOOP
    -- Check if this block_id + network_id combination already exists
    -- If so, skip this booth record
    SELECT COUNT(*) INTO booth_count
    FROM block_booths
    WHERE block_id = booth_record.block_id
      AND network_id IS NOT NULL;
    
    -- Try to find a network for this block at the same index position
    SELECT bn.id, bn.network_id INTO network_record
    FROM block_networks bn
    WHERE bn.block_id = booth_record.block_id
    ORDER BY bn.created_at
    OFFSET (booth_record.booth_order - 1)
    LIMIT 1;
    
    -- If we found a matching network, check if this combination already exists
    IF network_record IS NOT NULL THEN
      SELECT COUNT(*) INTO booth_count
      FROM block_booths
      WHERE block_id = booth_record.block_id
        AND network_id = network_record.network_id;
      
      -- Only update if this combination doesn't already exist
      IF booth_count = 0 THEN
        UPDATE block_booths
        SET network_id = network_record.network_id
        WHERE id = booth_record.id;
      ELSE
        RAISE NOTICE 'Skipping booth % for block % - network % already has a booth', 
          booth_record.id, booth_record.block_id, network_record.network_id;
      END IF;
    END IF;
  END LOOP;
END $$;
