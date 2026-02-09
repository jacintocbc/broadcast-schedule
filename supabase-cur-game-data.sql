-- Curling Live Game Data Table
-- Stores parsed CUR DT_RESULT XML data for viewing on deployed app.
-- Run this in the Supabase SQL Editor after the main migration.

CREATE TABLE cur_game_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_code TEXT NOT NULL,
  away_team_code TEXT NOT NULL,
  game_date TEXT NOT NULL,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_team_code, away_team_code, game_date)
);

CREATE INDEX idx_cur_game_data_teams ON cur_game_data(home_team_code, away_team_code);
CREATE INDEX idx_cur_game_data_date ON cur_game_data(game_date);
