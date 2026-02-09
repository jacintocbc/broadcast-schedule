-- IHO Live Game Data Table
-- Stores parsed IHO DT_RESULT XML data for viewing on deployed app.
-- Run this in the Supabase SQL Editor after the main migration.

CREATE TABLE iho_game_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_code TEXT NOT NULL,
  away_team_code TEXT NOT NULL,
  game_date TEXT NOT NULL,
  data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_team_code, away_team_code, game_date)
);

CREATE INDEX idx_iho_game_data_teams ON iho_game_data(home_team_code, away_team_code);
CREATE INDEX idx_iho_game_data_date ON iho_game_data(game_date);
