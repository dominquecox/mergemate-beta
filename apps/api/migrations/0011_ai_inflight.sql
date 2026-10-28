-- One row while an AI summary is being generated, so identical concurrent requests wait for that result instead of
-- calling the model again and being charged twice. The key is the user-scoped result cache key, so one user never
-- waits on (or reads) another's work. Rows expire, so a crashed request cannot block later ones.
CREATE TABLE ai_inflight (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX ai_inflight_user ON ai_inflight (user_id);
