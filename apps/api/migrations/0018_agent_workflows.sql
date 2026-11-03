CREATE TABLE workflow_runs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 idempotency_key TEXT NOT NULL, body_json TEXT NOT NULL, policy_revision TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX workflow_runs_owner ON workflow_runs(user_id,created_at DESC);
CREATE TABLE workflow_runners (id TEXT PRIMARY KEY,repositories_json TEXT NOT NULL,capabilities_json TEXT NOT NULL,last_seen_at TEXT NOT NULL);
CREATE TABLE workflow_jobs (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE REFERENCES workflow_runs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,repository TEXT NOT NULL,base_sha TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',runner_id TEXT,lease_hash TEXT,lease_expires_at TEXT,
 patch_json TEXT,patch_claim_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX workflow_jobs_claim ON workflow_jobs(status,created_at);
