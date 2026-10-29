-- 0013/0014 are reserved by independently reviewed account/voice PRs.
ALTER TABLE notification_state ADD COLUMN operation_id TEXT;
CREATE TABLE inbox_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 filter TEXT NOT NULL CHECK(filter IN ('all','review','mentions','mine'))
);
