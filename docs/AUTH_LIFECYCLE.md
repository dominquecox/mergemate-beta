# Authentication lifecycle (J-003)

Web uses a Secure, HttpOnly, SameSite=Lax __Host cookie and matching CSRF for writes. iOS and Android use bearer credentials held only in native SecureStore. Android is explicit in the API platform contract; both native platforms keep the fixed HTTPS callback allowlist. MM-086 adds a PKCE-protected browser-session return fallback described below; GitHub permissions are unchanged.

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

## MM-086 native browser return and web callback recovery

New installed clients request `nativeBrowser: true` when starting OAuth. GitHub still returns to the environment's fixed HTTPS callback, with `?native=1`. Older clients omit the capability and retain their existing callback. Web cannot request the native capability. Server-side pending state determines cookie versus bearer transport; the marker never selects session transport.

Native opens GitHub with expo-web-browser's authentication session (ASWebAuthenticationSession on iOS, browser auth tab on Android). If the HTTPS association opens the app, the verified callback completes and closes any leftover browser. Otherwise the web callback relays only code/state (or denial/state) to the registered `mergemate://auth/callback` route. An Open MergeMate button supports a browser that requires a user gesture. The relay does not exchange a code or set a session. The PKCE verifier stays in native SecureStore, and the resulting bearer credential is written through the existing secure token store. The exact scheme/host/path and approved HTTPS hosts are validated; arbitrary return URLs, duplicate query keys and mismatched states are rejected.

The native route and browser result can deliver the same callback. One provider-scoped completion promise handles both. Logout, a new login/demo intent, account deletion and session invalidation clear the completion. Generation fences still reject a stale result after a newer intent. Browser dismissal follows successful authenticated completion; cancellation is not reported as a successful login.

Web callback parameters are scrubbed from history. A callback remount with no parameters waits for session restoration and can continue using a verified existing cookie when no newer login is pending. It does not turn a failed PKCE exchange into a success or silently reuse an older account while another login intent is pending.

Validation uses unit/API transports and the real exported SPA at393/1440, including delayed /me, no-parameter callback restoration without another refresh, replay/denial, newer pending state preservation, account switching, two-tab logout/rotation and offline logout recovery. Browser fixtures cannot launch an installed mobile app. Managed desktop Chromium blocks custom-protocol navigation; actual ASWebAuthenticationSession/custom-tab/HTTPS-association delivery and SecureStore on the founder's devices remain owner acceptance.

Release API and web together through the canonical dev API/web release line, then rebuild/install both native clients to include SDK-pinned expo-web-browser58.0.6. Existing expo/expo-modules-core alignment is retained. There is no new migration, GitHub scope, store upload, CI activation or production release. Verify the existing GitHub callback registration accepts the same HTTPS path with the native query marker during the dev device smoke test.
