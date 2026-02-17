CREATE TABLE IF NOT EXISTS iho_game_detail (
  home_team_code TEXT NOT NULL,
  away_team_code TEXT NOT NULL,
  game_date TEXT NOT NULL,
  data JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (home_team_code, away_team_code, game_date)
);
