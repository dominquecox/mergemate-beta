-- Claim before contacting the provider. Never reclaim an ambiguous attempt on redelivery.
-- One push per user's inbox item, across webhook deliveries and notification kinds.
CREATE TABLE notification_push (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('review', 'mention', 'mine')),
  claimed_at TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'claimed' CHECK(outcome IN ('claimed', 'accepted', 'suppressed', 'failed')),
  PRIMARY KEY(user_id, notification_id)
);
