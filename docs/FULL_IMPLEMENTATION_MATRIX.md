# MM-085 implementation and acceptance

| Track | Delivered source | Local evidence | Remaining live acceptance |
| --- | --- | --- | --- |
| J-021 / Meta | Existing verified BYOK flow uses versioned AES-GCM user-bound ciphertext. Verification response is now byte bounded. Configured Meta routes use the saved key in a request-local environment. Workers AI vision byte payloads and SAM parsing are covered. Partial token usage stays unknown. Demo summaries explicitly say sample. | Existing key-isolation/encryption/route tests plus meta-live-provider.test.ts (fixture transport). | Real Meta key/provider request and actual Workers AI binding are unavailable in this cloud environment. No live receipt claimed. |
| J-022 | Existing authenticated per-device register/revoke and session-cascade cleanup; added fenced late registration, notification-tap internal PR routing, cold response handling and token-change refresh listeners. | Native-device adapters and routing/race tests. | Rebuilt iOS/Android physical-device permission, tap, token rotation and logout tests. Remote revocation requires connectivity; errors remain visible. Cross-account token takeover remains forbidden. |
| J-024 | Separate 7-day content-free event history with webhook-sender actor, unknown current PR status, persisted per-user read receipts, access/watch filtering, deterministic time/id cursor with user/filter/snapshot scope. Original inbox retains All/Mentions/Reviews/Mine and identifies PR author. Local calendar groups Today/Yesterday/Last Week through DST. | Real-migration API tests verify deduplication, access, read persistence and deletion isolation; browser phone/desktop fixtures. | History starts with newly ingested events after migration; prior events cannot be reconstructed. History offers All/Reviews; a generic comment is never labeled a mention. |
| J-025 | Existing IANA-zone wall-clock scheduler and push suppression retained. Added editable start/end/zone with validated save and explicit disabled-null state. | Existing overnight/DST/quiet suppression tests plus new client schedule tests and browser save/rejection. | Device delivery timing is controlled by OS/provider. Suppressed alerts do not delete inbox events and are not replayed as push later. |
| J-026 | Per-client memory-only GET retry queue (16 slots, 2 retries, exponential backoff, Retry-After seconds/date), abort on session clearing, browser/native reconnect listeners, offline banner and list cache invalidation/revalidation. Writes are never queued/replayed. | Retry timing/cancellation/cache isolation tests, browser reconnect fixture. | SDK-pinned expo-network 58.0.4 requires a native rebuild; OS connectivity is not proof of API reachability. |
| J-031 | Existing bounded waitlist validation/Turnstile/atomic duplicate behavior retained; optional bounded referralCode stored only as domain-separated SHA-256. | Site waitlist Worker tests against local D1 fixtures. | Site migration0002 and site rollout are separate from dev API/web release; production HOLD applies. |
| J-039 | Offline operator preflight checks fresh observed account/worker/binding/secret-name/migration/restore evidence plus required runtime variables. Values/errors are masked. | Positive and stale/missing/wrong-worker tests; no provider calls. | Owner supplies fresh observed evidence and normal deployment checks. Snapshot audit is not remote authorization or a deployment command. |
| J-044 | Offline SQL dump restoration into memory, integrity/FK/schema checks, optional read-only source comparison, retention-overdue counts. Source snapshot is never modified. Audit events expire after7days on existing cron. | All real API migrations restored; incomplete/unsafe dump rejection tests. | A real backup and source snapshot must be checked; synthetic test schemas are not a production restore receipt. |

## Migrations and native module

- API `0017_activity_audit.sql`: content-free event log and cascading per-user unread receipts.
- Site `0002_referral_hash.sql`: nullable referral hash. Do not deploy the new site handler against the old schema.
- No remote migration, deployment, flag/model-route activation, CI run, production release, public flip or submission was performed.
- Obtain backups and owner migration approval through the existing release process before applying pending remote schema changes. The source PR alone does not establish database readiness.
- Native builds must include expo-network; no simulator/store build or upload was performed.

## Reproduce

Run the four workspace suites, monorepo typecheck/lint, and site tests:

```sh
node --test apps/site/test/waitlist.test.mjs
node scripts/operator-tools.test.mjs
EXPO_PUBLIC_API_BASE_URL=/__api npm --prefix apps/mobile run export:web
npm test -w @mergemate/web
node apps/mobile/scripts/check-implementation-matrix.mjs
node apps/mobile/scripts/check-grand-prize.mjs
```

Run web tests after export finishes because tests inspect generated legal pages. Browser harnesses use local HTTP fixtures, not live GitHub/Meta or physical-device services. Evidence screenshots go to `/tmp/mergemate-mm085`.

Offline tools (trusted local artifacts only; no remote writes):

```sh
node scripts/verify-d1-retention.mjs --dump /path/to/backup.sql --source /path/to/read-only-snapshot.sqlite
node scripts/production-preflight.mjs /path/to/observed-snapshot.json
```

The preflight snapshot has version1, observedAt (within15minutes), environment (development/production), accountId, worker, bindings and secrets (arrays of names only), appliedMigrations (filenames), and backup (offline verifier result). Supply actual runtime variables through the operator's secure environment. Never put secret values in the snapshot. A missing/stale receipt fails closed. The scripts never deploy or bypass production HOLD.

## Submission handoff

MM-085 adds implementation and verification assets. Pitch/script assets from PR190 and existing submission WRITEUP remain the submission source. Live Meta evidence, physical-device smoke, final public-history/metadata scan, recording and owner submission remain separate gates; no completed commercial, security or hackathon-submission certification is implied by passing local tests.
