-- GitHub webhook deliveries, installation and pull request state, per-user repo access cache.

-- Seen delivery ids, for deduplication. Old rows are pruned by the queue consumer.
CREATE TABLE github_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX github_deliveries_received ON github_deliveries (received_at);

CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  updated_at TEXT NOT NULL
);

CREATE TABLE installation_repos (
  installation_id TEXT NOT NULL REFERENCES installations (id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  PRIMARY KEY (installation_id, repo_id)
);
CREATE INDEX installation_repos_name ON installation_repos (full_name);

-- Last webhook activity per pull request. Holds no repository content.
CREATE TABLE pr_activity (
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,
  installation_id TEXT,
  head_sha TEXT,
  last_event TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_full_name, number)
);
CREATE INDEX pr_activity_updated ON pr_activity (updated_at);
CREATE INDEX pr_activity_head ON pr_activity (repo_full_name, head_sha);

-- Repositories a user's own token could read, re-checked at most every 10 minutes.
CREATE TABLE user_repo_access (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  PRIMARY KEY (user_id, full_name)
);
CREATE TABLE user_access_checks (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL
);

-- Webhook messages that exhausted their retries.
CREATE TABLE webhook_dead_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  delivery_id TEXT,
  event TEXT,
  failed_at TEXT NOT NULL
);
CREATE INDEX webhook_dead_letters_failed ON webhook_dead_letters (failed_at);
