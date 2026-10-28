-- Existing receipts were acknowledged by the previous intake implementation.
-- New receipts remain pending until queue acknowledgement, so redelivery repairs a crash.
ALTER TABLE github_deliveries ADD COLUMN queued INTEGER NOT NULL DEFAULT 1 CHECK(queued IN (0,1));
