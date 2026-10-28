-- Keep native Android explicit without invalidating pending iOS/web authorization flows.
CREATE TABLE oauth_states_next (
  state TEXT PRIMARY KEY,
  code_challenge TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('ios','android','web')),
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
INSERT INTO oauth_states_next SELECT state,code_challenge,platform,redirect_uri,expires_at FROM oauth_states;
DROP TABLE oauth_states;
ALTER TABLE oauth_states_next RENAME TO oauth_states;
CREATE INDEX oauth_states_expires ON oauth_states(expires_at);

ALTER TABLE sessions ADD COLUMN family_id TEXT NOT NULL DEFAULT '';
UPDATE sessions SET family_id=token_hash WHERE family_id='';
CREATE INDEX sessions_family ON sessions(family_id);
-- A rotated credential authorizes only its own family logout and the CSRF bootstrap for that logout.
-- Both retain the original transport/CSRF; bootstrap returns no private account data.
-- It never authorizes data reads, refresh or ordinary writes.
CREATE TABLE session_lineage (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  demo INTEGER NOT NULL CHECK(demo IN (0,1)),
  transport TEXT NOT NULL CHECK(transport IN ('bearer','cookie')),
  csrf_token TEXT,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX session_lineage_family ON session_lineage(family_id);
CREATE INDEX session_lineage_expiry ON session_lineage(expires_at);
