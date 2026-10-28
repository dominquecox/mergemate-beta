# Webhook recovery

Intake verifies the original bytes before parsing. GitHub accepts the current and next signing secret; Stripe validates its signature timestamp within five minutes and accepts multiple v1 signatures. Neither handler trusts event contents as an authorization grant. GitHub has no signed delivery timestamp; delivery IDs provide replay deduplication rather than an invented freshness guarantee.

GitHub reads at most its configured body limit plus the final incoming chunk before cancelling. It retains one bounded buffer, including for many tiny chunks. Receipts distinguish pending from queue-acknowledged deliveries: provider retries repair an interruption between receipt creation and queue acknowledgement. Concurrent pending retries can enqueue the same compact event; consumers apply idempotent state updates and notification claims prevent repeated sends. Queue failure returns an error so the provider retries.

Consumers retry failures with a bounded delay. Source queue retry counts are bounded in configuration and exhausted deliveries move to their matching dead-letter queue. Both dead-letter consumers record identifiers only before acknowledging; failure to write the record leaves messages for retry. No raw webhook, code, customer object or credentials belong in logs or recovery notes.

## Operator recovery

1. Confirm the environment and identify the failed source and delivery/event ID from the dead-letter record. Do not export payloads or customer tables.
2. Fix the underlying database, configuration or provider outage before replaying. Check that the appropriate source and dead-letter consumers are running.
3. For GitHub, use the GitHub App's webhook Recent Deliveries page and explicitly redeliver the recorded delivery. Durable dead-letter recording clears that delivery's intake dedupe receipt, allowing this authorized provider replay. Do not create unsigned requests or disable verification.
4. For Stripe, use its test-mode event delivery resend action for the recorded event ID. Pending events requeue; completed events remain idempotent and canonical subscription state is fetched. Do not replay arbitrary payment/customer creation operations.
5. Verify the repaired canonical state, successful consumer acknowledgement and expected notification outcome. Preserve the append-only failure record. A dead-letter record is evidence of failure, not evidence of successful replay.

Deployment requires the appended receipt migration and all configured source/dead-letter consumers. Local tests and dry runs do not establish live delivery or provider acceptance. No automated external notification replay is performed.
