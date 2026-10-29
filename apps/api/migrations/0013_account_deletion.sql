-- Durable retry/fencing state; completed rows are short-lived, inaccessible tombstones.
-- No credentials or personal profile data. They prevent late work recreating user usage/cache.
CREATE TABLE account_deletions (
  user_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed')),
  lease_token TEXT,
  lease_until TEXT,
  grant_token_hash TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX account_deletions_completed ON account_deletions(completed_at);
CREATE TRIGGER deletion_fence_usage_insert BEFORE INSERT ON ai_usage_daily
WHEN EXISTS(SELECT 1 FROM account_deletions d WHERE NEW.scope IN (d.user_id,d.user_id||':triage',d.user_id||':metakey'))
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER deletion_fence_usage_update BEFORE UPDATE ON ai_usage_daily
WHEN EXISTS(SELECT 1 FROM account_deletions d WHERE NEW.scope IN (d.user_id,d.user_id||':triage',d.user_id||':metakey'))
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER deletion_fence_cache BEFORE INSERT ON ai_results_cache
WHEN EXISTS(SELECT 1 FROM account_deletions d WHERE d.user_id=NEW.user_id)
BEGIN SELECT RAISE(IGNORE); END;
