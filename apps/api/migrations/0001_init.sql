-- Users, sessions, GitHub tokens and per-user inbox state.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Pending sign-ins. One row per started flow; consumed once by the callback.
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  code_challenge TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'web')),
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX oauth_states_expires ON oauth_states (expires_at);

-- Only a SHA-256 hash of the session token is stored. Demo sessions have no user.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  transport TEXT NOT NULL CHECK (transport IN ('bearer', 'cookie')),
  csrf_token TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK ((demo = 1 AND user_id IS NULL) OR (demo = 0 AND user_id IS NOT NULL))
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);

-- GitHub user tokens, AES-256-GCM encrypted. key_version selects the decryption key.
CREATE TABLE github_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  key_version TEXT NOT NULL,
  access_token TEXT NOT NULL,
  access_expires_at TEXT,
  refresh_token TEXT,
  refresh_expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE repo_watch (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  watching INTEGER NOT NULL CHECK (watching IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, repo_id)
);
CREATE INDEX repo_watch_user_name ON repo_watch (user_id, full_name);

CREATE TABLE notification_state (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  done_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX notification_state_user_updated ON notification_state (user_id, updated_at);
