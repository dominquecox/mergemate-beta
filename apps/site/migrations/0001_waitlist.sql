CREATE TABLE waitlist (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('hero', 'footer')),
  remove_token_hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed'))
);
