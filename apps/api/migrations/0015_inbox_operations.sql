-- 0013/0014 are reserved by independently reviewed account/voice PRs.
ALTER TABLE notification_state ADD COLUMN operation_id TEXT;
CREATE TABLE inbox_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 filter TEXT NOT NULL CHECK(filter IN ('all','review','mentions','mine')),
 last_item_id TEXT,
 last_operation_id TEXT
);

-- Keep the last undo pointer in the same transaction as the successful CAS.
CREATE TRIGGER inbox_last_insert AFTER INSERT ON notification_state
WHEN NEW.operation_id IS NOT NULL
BEGIN
 INSERT INTO inbox_preferences(user_id,filter,last_item_id,last_operation_id) VALUES(NEW.user_id,'all',NEW.item_id,NEW.operation_id)
 ON CONFLICT(user_id) DO UPDATE SET last_item_id=excluded.last_item_id,last_operation_id=excluded.last_operation_id;
END;
CREATE TRIGGER inbox_last_update AFTER UPDATE ON notification_state
WHEN NEW.operation_id IS NOT NULL AND OLD.operation_id IS NOT NEW.operation_id
BEGIN
 INSERT INTO inbox_preferences(user_id,filter,last_item_id,last_operation_id) VALUES(NEW.user_id,'all',NEW.item_id,NEW.operation_id)
 ON CONFLICT(user_id) DO UPDATE SET last_item_id=excluded.last_item_id,last_operation_id=excluded.last_operation_id;
END;
