ALTER TABLE workflow_jobs ADD COLUMN patch_hash TEXT;
ALTER TABLE workflow_jobs ADD COLUMN approval_expires_at TEXT;
ALTER TABLE workflow_jobs ADD COLUMN approved_at TEXT;
ALTER TABLE workflow_jobs ADD COLUMN approval_credential_id TEXT;

CREATE TABLE webauthn_credentials (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 credential_id TEXT NOT NULL UNIQUE,
 public_key TEXT NOT NULL,
 counter INTEGER NOT NULL,
 transports_json TEXT NOT NULL,
 device_type TEXT NOT NULL,
 backed_up INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 last_used_at TEXT
);
CREATE INDEX webauthn_credentials_owner ON webauthn_credentials(user_id,created_at);

CREATE TABLE webauthn_challenges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL,
 challenge TEXT NOT NULL,
 binding_json TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX webauthn_challenges_owner ON webauthn_challenges(user_id,purpose,expires_at);

CREATE TABLE workflow_patch_approvals (
 job_id TEXT PRIMARY KEY REFERENCES workflow_jobs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 repository_id INTEGER NOT NULL,
 head_sha TEXT NOT NULL,
 patch_hash TEXT NOT NULL,
 action TEXT NOT NULL,
 credential_id TEXT NOT NULL REFERENCES webauthn_credentials(credential_id) ON DELETE RESTRICT,
 expires_at TEXT NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX workflow_patch_approvals_owner ON workflow_patch_approvals(user_id,created_at DESC);
