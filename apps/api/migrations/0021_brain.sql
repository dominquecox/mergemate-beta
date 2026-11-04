-- Brain: per-repo boards that coding agents work through. Additive only.
CREATE TABLE brain_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  rules TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, owner, repo)
);

CREATE TABLE brain_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES brain_projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2')),
  status TEXT NOT NULL CHECK (status IN ('open','active','review','merged','blocked')),
  done_when TEXT NOT NULL,
  branch TEXT,
  pr_number INTEGER,
  head TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX brain_cards_board ON brain_cards(project_id, position);

-- Agent API tokens: only a SHA-256 hash of the secret is stored; the secret is shown once.
CREATE TABLE brain_agent_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES brain_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tool TEXT NOT NULL CHECK (tool IN ('codex','copilot','muse','claude','mergemate','other')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

-- One live lock per card, and one per agent token.
CREATE TABLE brain_locks (
  card_id TEXT PRIMARY KEY REFERENCES brain_cards(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES brain_projects(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE REFERENCES brain_agent_tokens(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  tool TEXT NOT NULL,
  since TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE brain_handoffs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES brain_cards(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  stopped_at TEXT NOT NULL,
  branch TEXT,
  head TEXT,
  next TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX brain_handoffs_card ON brain_handoffs(card_id, at DESC);

-- Append-only track log per project.
CREATE TABLE brain_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES brain_projects(id) ON DELETE CASCADE,
  card_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('lock','unlock','heartbeat','handoff','pr_opened','validation','verified','merged','deploy','note')),
  actor TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX brain_events_tail ON brain_events(project_id, at DESC);
