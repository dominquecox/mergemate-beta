-- 0013 is reserved by the independent J-005 account deletion PR.
CREATE TABLE private_notes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 context_key TEXT NOT NULL,
 context_json TEXT NOT NULL,
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 8000),
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,id)
);
CREATE INDEX private_notes_context ON private_notes(user_id,context_key,created_at,id);
