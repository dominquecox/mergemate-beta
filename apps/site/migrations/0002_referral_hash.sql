-- Optional campaign/referral identifier. Raw referral codes are never persisted.
ALTER TABLE waitlist ADD COLUMN referral_hash TEXT CHECK (referral_hash IS NULL OR length(referral_hash) = 64);
