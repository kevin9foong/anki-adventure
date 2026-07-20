-- CLOUD-1: bearer-authenticated cloud saves. Raw bearer tokens never enter this table.
CREATE TABLE IF NOT EXISTS cloud_saves (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  party_json TEXT NOT NULL DEFAULT '[]',
  storage_json TEXT NOT NULL DEFAULT '[]',
  active_monster_id TEXT,
  daily_new_card_limit INTEGER NOT NULL DEFAULT 10,
  limit_date TEXT,
  extra_new_cards_today INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cloud_saves_token_hash_idx ON cloud_saves(token_hash);
