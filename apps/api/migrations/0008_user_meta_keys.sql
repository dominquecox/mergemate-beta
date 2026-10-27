-- User credentials are sealed with the versioned token cipher and user-specific AAD.
CREATE TABLE user_meta_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_version TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
