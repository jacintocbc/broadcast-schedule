-- Planning: On Air row metadata (producer broadcast times and notes per block).
-- Run this in the Supabase SQL editor to create the table.

CREATE TABLE IF NOT EXISTS planning (
  block_id uuid PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE,
  producer_broadcast_start_time timestamptz,
  producer_broadcast_end_time timestamptz,
  notes text,
  sort_order integer NOT NULL DEFAULT 0
);

-- Optional: enable RLS and add policy if you use Row Level Security
-- ALTER TABLE planning ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for anon" ON planning FOR ALL USING (true) WITH CHECK (true);
