# AI consent and preferences (J-020)

## Model
- One account-owned policy revision (`ai_policy`, migration `0016_ai_policy_revision.sql`, **source-only, not applied remotely**; 0013-0015 are reserved by other open PRs).
- `GET/PUT /v1/consent/preferences` is the only way the app reads or changes AI consent and the "AI summaries and risk" preference. Grants and summaries changes are compare-and-set on `expectedRevision`; a revoke needs no revision. A generic `PUT /v1/settings` save keeps the stored `aiSummaries` value, so a stale screen cannot flip it.
- Any change moves the revision and deletes cached AI results. Pending AI work captures the revision at the gate and re-checks it before dispatch, before delivering a result and before every cache write. A revoke, summaries-off or re-grant during a call blocks delivery and caching and gives the usage back. Work leases are scoped to the revision (`policyWorkKey`).
- Revoking cannot recall what was already sent to the model provider; the disclosure says so.

## App
- `src/consent/aiChoices.ts` holds the server's last confirmed state. Nothing shows as saved before the server confirms it; a failed change keeps the previous state and an error; `consent_changed` reloads the server state and keeps the message; answers that arrive after sign-out or an account switch are dropped.
- `ConsentContext` makes one controller per account, refreshes on foreground (`AppState`, `visibilitychange`, window focus) and on opening Settings. The demo is read-only.
- Consent screen lists what may be sent (PR text, screenshots and voice notes separately) and what to know (pattern-based masking can miss secrets and does not cover screenshots or audio; no claim about provider retention or training beyond "not verified").
- Settings has two switches: AI processing (turning it on opens the disclosure; turning it off revokes) and AI summaries and risk. The second is a child of the first: indented, dimmed and disabled while processing is off, and switched on and off by a grant or revoke (a grant turns it on, a revoke turns it off). Once consent is on it can be turned off alone.

## Checks
- `npm test` (API `test/ai-policy.test.ts`, `test/ai-engine.test.ts`; app `test/ai-choices.test.ts`), `npm run typecheck`, `npm run lint`.
- Browser fixture against the exported app: `EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile && node apps/mobile/scripts/check-consent.mjs` (set `MM_CHROME_PATH` for a non-Chrome binary). The API is a stateful fixture, not the real Worker.

## Not proven here
Real D1 trigger behaviour on a remote database (tests use the SQLite test D1), physical devices, authenticated dev smoke, screen-reader acceptance and production acceptance. The `migrations 0013-0015` ordering must be resolved when the other PRs land.
