ALTER TABLE workflow_jobs ADD COLUMN repository_id INTEGER CHECK(repository_id > 0);
CREATE INDEX workflow_jobs_repository_identity ON workflow_jobs(repository_id,status,created_at);

ALTER TABLE workflow_runners ADD COLUMN credential_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_runners ADD COLUMN credential_jti TEXT;
ALTER TABLE workflow_runners ADD COLUMN credential_expires_at TEXT;
ALTER TABLE workflow_runners ADD COLUMN revoked_at TEXT;

CREATE TABLE workflow_audit_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL UNIQUE,
 sequence INTEGER NOT NULL,
 previous_hash TEXT,
 event_hash TEXT NOT NULL UNIQUE,
 event_type TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 body_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id,sequence)
);
CREATE INDEX workflow_audit_owner ON workflow_audit_events(user_id,sequence DESC);

CREATE TABLE workflow_audit_outbox (
 event_key TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 body_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX workflow_audit_outbox_owner ON workflow_audit_outbox(user_id,created_at,event_key);

CREATE TABLE workflow_audit_checkpoints (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 event_count INTEGER NOT NULL,
 head_hash TEXT NOT NULL,
 signature TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
