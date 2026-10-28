-- Browser (Web Push) subscriptions, one per user and browser. Like device tokens they belong to a
-- session: signing out or an expired session removes them, and rotation reattaches them.
CREATE TABLE web_push_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,device_id)
);
CREATE INDEX web_push_subscriptions_session ON web_push_subscriptions(session_hash);
