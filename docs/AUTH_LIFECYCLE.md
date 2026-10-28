# Authentication lifecycle (J-003)

Web uses a Secure, HttpOnly, SameSite=Lax __Host cookie and matching CSRF for writes. iOS and Android use bearer credentials held only in native SecureStore. Android is explicit in the API platform contract; both native platforms keep the fixed HTTPS callback allowlist. No custom-scheme fallback or GitHub permission expansion is added.

## Session rotation and revocation

Migration `apps/api/migrations/0012_session_families_android.sql` must be applied before this API source is released. It preserves existing sessions, push registrations and pending iOS/web OAuth states while admitting Android states. The upgrade test starts with the previous schema populated, then applies0012 and verifies data, foreign keys and indexes. No deployed migration is edited.

Rotation is one atomic D1 batch: only one replacement wins, push registrations move with it, and the old token becomes a spent credential. The family identifier preserves shared rate-limit identity across rotations. A spent credential may only revoke its own family and obtain its original CSRF through the narrowly allowed bootstrap route; it cannot read account data, refresh or perform other writes. Transport and CSRF checks remain enforced. Logout/bootstrap use independent IP admission so an exhausted session budget cannot prevent revocation. Other login families remain valid.

Expired or idle current/spent credentials are removed during rotation and by the existing fifteen-minute cleanup schedule. No new provider call or scheduled service is introduced. The existing idle and absolute expiry limits remain in effect.

## Client behavior

Session mutations and credential writes are serialized. Stale requests cannot restore a previous account, clear a newer credential or delete a different account. Web Locks coordinate cookie writers across tabs; same-origin BroadcastChannel events carry only a version and sign-in/sign-out kind. If the browser lacks these APIs, server atomicity and per-client generation checks still apply, but cross-tab coordination is unavailable.

The API's authenticated demo metadata takes precedence over a legacy local preference. Native session credential storage fails closed if SecureStore is unavailable. Pending PKCE is consumed once and expires; an old or mismatched callback cannot delete a newer pending flow. Authorization errors and callback queries are removed from browser history. Read-only GitHub permissions are unchanged.

Sign-out hides private state immediately. A non-secret pending logout marker prevents an unrevoked browser cookie from restoring a session after offline sign-out or reload. The Sign-in screen offers **Finish signing out** until revocation succeeds or the server confirms the session is already unauthorized. Network failure is shown as incomplete sign-out. Storage-blocking browsers retain the marker only in memory; server revocation still requires a connection.

Private navigation is hidden pending authentication. Account changes reset private navigation state. Before page-cache freezing, a synchronous privacy cover replaces the private root; persisted restoration rechecks the session before revealing React's committed authenticated or signed-out view.

## Reproduce source validation

Run from the repository root:

```sh
npm run check
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-session-lifecycle.mjs
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm exec -w @mergemate/mobile -- expo export -p ios -p android --output-dir /private/tmp/j003-native-export
npm exec -w @mergemate/api -- wrangler deploy --env dev --dry-run --outdir /private/tmp/j003-api-dryrun
git diff --check
```

Measured:506 API,246 mobile,23 site/web and21 contract tests (796 total; full795-test check followed by the affected mobile suite with the added delayed-JSON regression); typecheck/lint, three JS exports and dev API dry run exit0. API tests include one-winner rotation, rollback, expired/idle retention, legacy upgrade, cookie CSRF, spent-token isolation and revocation with an exhausted session budget. Client tests cover stale responses, serialized credentials, account switches, Web Locks, logout intent and native storage failures.

The browser script starts its own loopback fixture server and real exported app in installed Chrome at393px and1440px. It intercepts all GitHub/API traffic and asserts the actual PKCE verifier, success/cancel/replay, restoration, authoritative demo status, two-tab refresh serialization, account switch, logout/Back and offline logout reload/recovery. It leaves screenshots in `/private/tmp/mergemate-session-lifecycle`. Fixtures are tests only; no production stub is added. Browser transport interception is not proof of real provider cookies or native universal-link delivery.

Changed-commit redacted Gitleaks scan:zero findings. Whole source:two unchanged RFC8291 Web Push test vectors at `apps/api/test/web-push.test.ts`; no scanner suppression added.

## Independent review and release gates

This is source verification, not a deployment or production acceptance. Independent exact-SHA review and the owner's merge are required. Actual GitHub account/cookie acceptance, native compiled builds, SecureStore behavior on devices, verified-link association/signing and native cold/warm callbacks remain operator/device checks. No remote migration, deployment, workflow execution, paid service, provider call or store build was performed.

When reconciling other open tickets, preserve J-001's readout cancellation hooks in AuthContext and J-027's focus behavior in navigation and Sign-in. Each ticket was based on development separately; do not drop either feature during merge resolution.

## Rebase verification (2026-10-28)

Rebased onto development e78f969 (including merged Highlight gates, accessible navigation, billing and Apple identity). Public flag fetching still omits credentials and session changes invalidate its cache. Heading focus and reduced motion are preserved. Re-ran full workspace check:511 API,273 mobile,23 web and22 contract tests (829), typecheck/lint, Chrome session journeys at393/1440, web/iOS/Android JS exports and dev API dry run. No remote migration or deployment. These counts supersede the earlier base counts above.

## Combined readout/session verification after owner merges (2026-10-28)

the owner merged production VAPID PR124 (9efb08b) and readout PR120 (34912e7). This PR is rebased onto34912e7. Conflict resolution retains the readout provider, forced flag refresh, default-off Highlight, heading focus/reduced motion and immediate readout stops on sign-out, deletion and unauthorized responses. Cross-tab session notifications also stop narration synchronously before clearing/revalidating identity. The session browser fixture now starts readout in the peer tab and proves cancellation on both account switch and sign-out at393px and1440px.

Combined source checks:511 API,286 mobile,23 web and22 contracts (842 total), typecheck/lint; session and readout browser suites; web/iOS/Android JS exports; dev API deployment dry run; changed-commit redacted secret scan0. Browser speech/GitHub/API transports are mocked. The Android native module is unchanged from the module/AAR and full arm64 debug APK compilation verified for merged PR120; no repeat native compilation is claimed here. Device audio remains a release gate.

Migration0012 is still unapplied remotely. the owner's final merge and the existing dev API/web release runner apply pending dev migrations before API deployment and then ship the web app; independent exact-head review precedes merge. Do not deploy this source before0012 is applied. Production release is a separate gate.
