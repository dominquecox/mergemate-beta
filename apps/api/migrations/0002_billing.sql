CREATE TABLE billing_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro')),
  status TEXT NOT NULL DEFAULT 'none',
  subscription_id TEXT,
  renews_at TEXT,
  cancel_at TEXT,
  operation_token TEXT,
  deleting INTEGER NOT NULL DEFAULT 0 CHECK(deleting IN (0,1)),
  updated_at TEXT NOT NULL
);
CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX stripe_events_pending ON stripe_events(status,received_at);
