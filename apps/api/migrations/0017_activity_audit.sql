-- Content-free, deduplicated webhook event audit. Actor is the event sender, never inferred from PR author.
CREATE TABLE activity_audit (
 id TEXT PRIMARY KEY,
 repo_full_name TEXT NOT NULL,
 number INTEGER NOT NULL CHECK(number>0),
 event TEXT NOT NULL,
 actor TEXT,
 received_at TEXT NOT NULL
);
CREATE INDEX activity_audit_time ON activity_audit(received_at DESC,id ASC);
CREATE TABLE activity_read (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES activity_audit(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,event_id)
);
