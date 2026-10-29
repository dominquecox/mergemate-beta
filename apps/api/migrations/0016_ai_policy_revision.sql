-- 0013–0015 remain reserved by account deletion, private notes and Inbox PRs.
CREATE TABLE ai_policy (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision TEXT NOT NULL,
 command TEXT
);
INSERT INTO ai_policy(user_id,revision) SELECT id,lower(hex(randomblob(16))) FROM users;
ALTER TABLE ai_results_cache ADD COLUMN policy_revision TEXT;
CREATE TRIGGER ai_policy_user AFTER INSERT ON users BEGIN
 INSERT INTO ai_policy(user_id,revision) VALUES(NEW.id,lower(hex(randomblob(16))));
END;
CREATE TRIGGER ai_policy_consent_insert AFTER INSERT ON consent_grants BEGIN
 UPDATE ai_policy SET revision=lower(hex(randomblob(16))) WHERE user_id=NEW.user_id;
 DELETE FROM ai_results_cache WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER ai_policy_consent_update AFTER UPDATE ON consent_grants BEGIN
 UPDATE ai_policy SET revision=lower(hex(randomblob(16))) WHERE user_id=NEW.user_id;
 DELETE FROM ai_results_cache WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER ai_policy_settings_insert AFTER INSERT ON user_settings
WHEN (CASE WHEN json_valid(NEW.settings) THEN json_extract(NEW.settings,'$.aiSummaries') ELSE NULL END) IS NOT 1 BEGIN
 UPDATE ai_policy SET revision=lower(hex(randomblob(16))) WHERE user_id=NEW.user_id;
 DELETE FROM ai_results_cache WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER ai_policy_settings_update AFTER UPDATE ON user_settings
WHEN (CASE WHEN json_valid(NEW.settings) THEN json_extract(NEW.settings,'$.aiSummaries') ELSE NULL END)
 IS NOT (CASE WHEN json_valid(OLD.settings) THEN json_extract(OLD.settings,'$.aiSummaries') ELSE NULL END) BEGIN
 UPDATE ai_policy SET revision=lower(hex(randomblob(16))) WHERE user_id=NEW.user_id;
 DELETE FROM ai_results_cache WHERE user_id=NEW.user_id;
END;
-- Old workers and stale requests cannot repopulate invalidated AI results.
CREATE TRIGGER ai_cache_insert_fence BEFORE INSERT ON ai_results_cache
WHEN NOT EXISTS(SELECT 1 FROM ai_policy WHERE user_id=NEW.user_id AND revision=NEW.policy_revision) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER ai_cache_update_fence BEFORE UPDATE ON ai_results_cache
WHEN NOT EXISTS(SELECT 1 FROM ai_policy WHERE user_id=NEW.user_id AND revision=NEW.policy_revision) BEGIN SELECT RAISE(IGNORE); END;
