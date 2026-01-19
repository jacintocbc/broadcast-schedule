-- Cleanup script to delete all blocks and their relationships
-- WARNING: This will delete ALL blocks and cannot be undone!
-- Use this to start fresh after schema changes

-- Delete all block relationships first (due to foreign key constraints)
DELETE FROM block_commentators;
DELETE FROM block_booths;
DELETE FROM block_networks;

-- Delete all blocks
DELETE FROM blocks;

-- Optional: Reset sequences if you want to start IDs from 1
-- ALTER SEQUENCE blocks_id_seq RESTART WITH 1;
