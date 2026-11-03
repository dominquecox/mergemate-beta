# Account deletion and cleanup (J-005)

`DELETE /v1/account` is an authenticated, CSRF-protected operation for the current account only. It accepts no target user id. Public deletion guidance sends the person to authenticated deletion or verified support; there is no unauthenticated deletion endpoint. Demo sessions cannot delete an account. GitHub repository permissions remain read-only.

## Completion and retry semantics

1. Append-only migration `0013_account_deletion.sql` supplies durable deletion state. Apply it before deploying this API. Existing migrations, production resources, secrets and bindings are unchanged.
2. A random ten-minute lease admits one deletion attempt. Normal errors release it; a crashed attempt can be reclaimed after expiry. Every progress write and the final deletion are fenced by the lease owner. Deletion-owned billing locks can be recovered with a finished/expired deletion lease; unrelated checkout/portal locks are never stolen.
3. Open checkouts are expired and active billing is confirmed cancelled before GitHub revocation. A cancellation failure retains the account and keeps further account activity paused.
4. Only a GitHub `204` confirms revocation. `401`, `404`, `422`, server errors and network ambiguity are not silently accepted as success. The confirmed grant is remembered as a hash of its encrypted token snapshot, never as another plaintext credential. If uploads/database cleanup then fails, retry skips that already-confirmed grant. A newly authorized token has a different snapshot and must be revoked too.
5. User-prefixed uploads are purged across pages. A repeated cursor fails explicitly. An upload already in flight when deletion starts is refused before model work and cleaned in `finally`, including a write that succeeds but loses its response. The private bucket's existing one-day lifecycle remains the backstop when storage itself cannot confirm deletion; it is not a claim that an outage was successful cleanup.
6. One D1 transaction removes user usage and the user record, cascades the other user-owned tables and completes a minimal receipt. A concurrent new OAuth grant prevents final deletion and requires retry. Database errors roll back local deletion. Existing sessions, spent session lineage, tokens, BYOK, settings, consent, review state, push registrations/receipts, caches and in-flight records are covered. Another user's rows and uploads remain intact.
7. Only confirmed completion returns204 and clears the web cookie. A duplicate while running gets429; a request using a removed session gets401 and cannot learn another account's state. An unconfirmed request never reports complete deletion.

External HTTP calls in the deletion attempt share a55-second budget, below the lease lifetime. R2/D1 operations retain their platform behavior; lease and snapshot fencing prevent a stale attempt from completing another attempt's work. A legacy/unrelated abandoned billing lock still requires operator reconciliation rather than unsafe automatic takeover.

## Recovery access and late work

Once deletion is pending, ordinary private operations and session refresh are denied. Recovery allows current-account metadata, CSRF bootstrap, sign-out and another deletion attempt, all still subject to rate admission and transport checks. Deletion recovery remains possible after session-budget exhaustion, through independent IP admission. Suspended accounts with an existing session may delete; a pending suspended account can read only the minimal metadata needed for recovery. There is no general suspension bypass.

OAuth reauthorization can restore usable credentials for finishing deletion. Callback and `/me` metadata tell the client that deletion is pending. The client redirects private navigation to the deletion screen; token-free peer-tab notifications recheck that state. Lease/snapshot checks stop an older cleanup deleting a newly authorized grant without revoking it.

Database triggers stop late user-budget/cache writes from recreating deleted user state. They use indexed user-id lookups, cover user/triage/Meta-key scopes and leave the global service budget intact. Foreign keys protect the other owned tables.

## Device cleanup

After the server confirms deletion, local erasure runs inside the same serialized session mutation before a queued new sign-in adopts credentials. It removes account consent preferences, recent searches, device/push preferences and browser push ownership, and resets demo state. Session credentials and request caches are cleared; device theme is preserved. Pending PKCE cleanup remains guarded by the current identity generation.

If local storage erasure fails after remote success, the account is still correctly reported as deleted. A non-secret cleanup marker and an in-memory fence prevent sign-in/demo restoration until **Clear local data** succeeds. The recovery screen survives reload when storage can persist the marker; it retries local cleanup without repeating remote deletion. If the platform blocks both persistence and erasure, manual browser-site/app-data removal remains necessary. No claim is made that inaccessible storage was erased.

## Retention boundaries

A pending job retains the account and sealed credentials necessary for a truthful retry; it is not presented as complete deletion. Completed receipts contain only the random internal user id, state and timestamps; grant hashes and operation owners are cleared. They prevent late work recreating usage/cache and become eligible for removal after seven days by the existing fifteen-minute scheduled cleanup. Monitor scheduled failures; do not infer an exact physical deletion second from the threshold.

Global budget counters, shared repository/service security data and billing/webhook records that are not solely owned by this app account remain separate. Stripe-hosted billing records are not deleted by this endpoint. Pending pre-auth OAuth states contain no user association and retain their existing short expiry. Waitlist removal is a separate authenticated-link/support flow and is not silently coupled to app deletion. No unrelated admin/audit/legal records are deleted.

## Reproduce local verification

From the repository root:

```sh
npm ci --ignore-scripts
npm run check
node apps/site/scripts/check.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-account-deletion.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm exec -w @mergemate/mobile -- expo export -p ios -p android --output-dir /private/tmp/j005-native-exports
npm exec -w @mergemate/api -- wrangler deploy --env dev --dry-run --outdir /private/tmp/j005-api-dryrun
npm exec -w @mergemate/api -- wrangler deploy --config ../site/wrangler.toml --dry-run --outdir /private/tmp/j005-site-dryrun
git diff --check
```

The browser command starts a temporary loopback server, uses the real exported app and the actual public deletion HTML, and drives Chrome at393px/1440px. It covers cancelled confirmation, unauthenticated access, failed/retried deletion, held loading state, peer-tab/private-navigation isolation, local erasure with theme preservation, Back, persisted local-cleanup failure/retry, demo denial and a fixed authenticated public entry. API/GitHub/speech/storage failures are fixtures, not live provider evidence. Screenshots are in `/private/tmp/mergemate-account-deletion`.

SQL tests seed every user-owned table type and a second user. They cover cascade/isolation, pagination, CSRF, cookie clearing, suspended-owner recovery, concurrency, lease takeover, owned/foreign billing locks, revocation status failures, reauthorization, changed-grant fencing, database rollback, storage retry, late writes and retention. Mobile tests cover erasure ordering, failure reporting and the cleanup marker.

Baseline at6c13ab1:842 workspace tests/typecheck/lint passed on repeat. Early unchanged real-DO fixture runs intermittently reset localhost connections; bounded-worker API runs passed without skipping tests. Later full default `npm run check` runs passed too. Keep those failures visible; no runtime-test or CI suppression was introduced.

## Measured source proof

Final source verification2026-10-29 (America/Indianapolis), full `npm run check`:531 API,293 mobile,23 web and22 contract tests (869 total), typecheck/lint exit0. Site checker:18tests plus typecheck/lint/assets exit0. Web/iOS/Android JS exports and devAPI/site packaging dry runs exit0. The browser fixture covers6 width/scenario combinations and leaves ten inspected screenshots (retry/loading/public-guide/local-cleanup/demo). Changed-commit redacted Gitleaks scan:0 findings; whole source retains only2 unchanged published RFC8291 Web Push fixture matches at apps/api/test/web-push.test.ts:12/14. No scanner ignore or test suppression added.

## Review and release

One PR targets development. Independent exact-head review precedes the owner's merge. No self-PASS, remote migration, real account deletion, provider call, deployment, workflow or signed/store build was performed. iOS/Android JavaScript exports are packaging evidence, not device erasure acceptance. Native speech module code is unchanged from the previously verified Android build.

After merge, the standard dev API/web release runner applies pending0013 before API deployment. The public-site guide is source-ready for the owner-controlled site release alongside an available production app host; do not publish its production entry link as a working live flow before that host is ready. Actual provider/device acceptance uses an operator-controlled disposable account and remains a separate release gate.

## Primary references

- GitHub grant deletion and response semantics: https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
- D1 batch transaction/rollback behavior: https://developers.cloudflare.com/d1/worker-api/d1-database/
