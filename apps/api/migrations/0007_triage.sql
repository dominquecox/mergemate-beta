-- Triage choices. One row per user and pull request; rows die with the user (see DELETE /v1/account).
-- item_id is the inbox item id of the pull request, built from the lower-cased repository name.
CREATE TABLE triage_choices (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('needs_you', 'fyi', 'ignore')),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
