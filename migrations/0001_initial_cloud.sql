-- Initial optional Cloudflare D1 schema for cloud saves and curated decks.
-- Raw bearer tokens are never stored; only their hashes are persisted.
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

CREATE TABLE IF NOT EXISTS curated_decks (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id TEXT NOT NULL REFERENCES curated_decks(id) ON DELETE CASCADE,
  source_card_id TEXT NOT NULL,
  new_position INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  reading TEXT,
  furigana TEXT,
  example TEXT,
  example_translation TEXT,
  example_furigana TEXT,
  PRIMARY KEY (deck_id, source_card_id)
);

CREATE TABLE IF NOT EXISTS save_selected_decks (
  save_id TEXT NOT NULL REFERENCES cloud_saves(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES curated_decks(id) ON DELETE CASCADE,
  PRIMARY KEY (save_id, deck_id)
);

CREATE TABLE IF NOT EXISTS cloud_card_progress (
  save_id TEXT NOT NULL REFERENCES cloud_saves(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL,
  source_card_id TEXT NOT NULL,
  state TEXT NOT NULL,
  due_at TEXT,
  introduced_on TEXT,
  interval_days INTEGER NOT NULL DEFAULT 0,
  stability REAL,
  difficulty REAL,
  reps INTEGER,
  lapses INTEGER,
  learning_steps INTEGER,
  last_reviewed_at TEXT,
  PRIMARY KEY (save_id, deck_id, source_card_id),
  FOREIGN KEY (deck_id, source_card_id) REFERENCES deck_cards(deck_id, source_card_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cloud_card_progress_save_deck_idx ON cloud_card_progress(save_id, deck_id);
