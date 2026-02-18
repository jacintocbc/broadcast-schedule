CREATE TABLE IF NOT EXISTS cur_pbp_images (
  id TEXT PRIMARY KEY,
  game_key TEXT NOT NULL,
  end_num INTEGER NOT NULL,
  stone_num INTEGER NOT NULL,
  image_data TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cur_pbp_images_game_key ON cur_pbp_images (game_key);
