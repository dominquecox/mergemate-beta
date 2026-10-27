CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings TEXT NOT NULL CHECK(json_valid(settings)),
  updated_at TEXT NOT NULL
);
CREATE TABLE push_tokens (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,device_id)
);
CREATE INDEX push_tokens_session ON push_tokens(session_hash);
CREATE TABLE push_receipts (
  ticket_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  next_check_at TEXT NOT NULL,
  FOREIGN KEY(user_id,device_id) REFERENCES push_tokens(user_id,device_id) ON DELETE CASCADE
);
CREATE INDEX push_receipts_due ON push_receipts(next_check_at);
