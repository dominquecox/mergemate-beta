-- AI consent, usage caps and result cache. Rows die with the user (see DELETE /v1/account).

CREATE TABLE consent_grants (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  version TEXT NOT NULL,
  at TEXT NOT NULL
);

-- scope is a user id, or 'global' for the service-wide budget.
CREATE TABLE ai_usage_daily (
  scope TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (scope, day)
);
CREATE INDEX ai_usage_daily_day ON ai_usage_daily (day);

-- key is user-scoped (user_id:kind:prRef@headSha) so one user never reads another's cache.
CREATE TABLE ai_results_cache (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_results_cache_user ON ai_results_cache (user_id);
