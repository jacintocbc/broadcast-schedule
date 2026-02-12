-- Medal alerts table for Canadian medal wins
CREATE TABLE IF NOT EXISTS medal_alerts (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  discipline_name TEXT,
  event_code TEXT NOT NULL,
  event_name TEXT NOT NULL,
  medal_type TEXT NOT NULL,
  athletes JSONB,
  event_date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
