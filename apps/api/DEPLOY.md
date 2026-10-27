# API secrets (one-time setup)

Non-secret settings live in `wrangler.toml` under `[vars]`. Secrets are set once per Worker environment with `wrangler secret put`, which prompts for the value so it never lands in shell history, the repo or a log. Locally, put the same names in `apps/api/.dev.vars` (git-ignored; names in `.dev.vars.example`).

Deploying is a separate, owner-run release step; this file only covers secrets. Wrangler needs Node 22 or newer.

Run from the repository root. Each command sets one secret for the `dev` environment (`mergemate-api-dev`); swap `--env dev` for `--env production` for `mergemate-api`.

| Secret | Used for |
| --- | --- |
| `MODEL_API_KEY` | AI provider key (server-side only) |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App sign-in |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook signature check |
| `GITHUB_WEBHOOK_SECRET_NEXT` | Only while rotating the webhook secret: the new value, accepted alongside the current one |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored GitHub tokens. Format `<version>:<base64 32 bytes>`; to rotate, move the old value to `TOKEN_ENCRYPTION_KEY_PREVIOUS` and set a new version |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature check |
| `RESEND_API_KEY` | Transactional email |
| `EMAIL_FROM` | Sender address for support mail (not secret; kept out of the repo) |
| `SUPPORT_EMAIL` | Where support mail goes (not secret; kept out of the repo) |
| `TURNSTILE_SECRET_KEY` | Bot check on public forms |

```bash
npm exec -w @mergemate/api -- wrangler secret put MODEL_API_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put GITHUB_APP_CLIENT_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put GITHUB_WEBHOOK_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put TOKEN_ENCRYPTION_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put STRIPE_SECRET_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put STRIPE_WEBHOOK_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put RESEND_API_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put EMAIL_FROM --env dev
npm exec -w @mergemate/api -- wrangler secret put SUPPORT_EMAIL --env dev
npm exec -w @mergemate/api -- wrangler secret put TURNSTILE_SECRET_KEY --env dev
```

## Check variable names

`npm run check:env -w @mergemate/api` compares variable names (never values) in the code, `.dev.vars.example` and your local `apps/api/.dev.vars`. It fails on a name the code never reads, which usually means a typo or an old name, and warns about names missing locally. A test also pins the approved names, so a rename can't slip into a PR unnoticed.

## AI models

Each AI task has its own route in `wrangler.toml` `[vars]`: `MODEL_ROUTE_SUMMARY`, `MODEL_ROUTE_RISK`, `MODEL_ROUTE_TRIAGE` and `MODEL_ROUTE_HIGHLIGHT`, written `provider:model`. The code accepts only a fixed list of routes; an unset or unlisted value is a configuration error, and there is no fallback to another route. `MODEL_BASE_URL` and the `MODEL_API_KEY` secret apply to `meta:` routes only.

`workers-ai:` routes use the `AI` binding (`[ai]` in `wrangler.toml`), which needs no secret. To send those calls through AI Gateway, set `AI_GATEWAY_ID` as a plain var to the gateway's id (not a secret; leave it out of `wrangler.toml` until the gateway exists, and turn prompt and response logging off on the gateway). When it is unset, Workers AI is called without a gateway.

Every model call writes one content-free data point to the `AI_METRICS` Analytics Engine dataset (`mergemate_ai_metrics_dev` for local and dev, `mergemate_ai_metrics` for production): blobs task, provider, model, outcome; doubles input tokens, output tokens, latency in ms.

## Highlight uploads (one-time per environment)

Highlight screenshots wait in a private R2 bucket between receipt and deletion. The API
deletes each upload right after analysis and account deletion purges the user's keys, so
what follows is only the backstop. Create the bucket (private by default; never attach a
public domain or custom-domain access):

```bash
npm exec -w @mergemate/api -- wrangler r2 bucket create mergemate-highlight-uploads-dev
npm exec -w @mergemate/api -- wrangler r2 bucket create mergemate-highlight-uploads
```

Then add a 1-day object-expiry rule on each bucket, so anything a failed delete leaves
behind disappears within a day. The `IMAGES` binding (Image Transformations, used to
resize uploads and strip their metadata) needs no bucket and no secret.

## Database (one-time per environment)

Create the D1 database, put the printed `database_id` in a `[[env.dev.d1_databases]]` block (binding `DB`, `database_name = "mergemate-db-dev"`, `migrations_dir = "migrations"`) in `wrangler.toml`, then apply migrations:

```bash
npm exec -w @mergemate/api -- wrangler d1 create mergemate-db-dev
npm exec -w @mergemate/api -- wrangler d1 migrations apply mergemate-db-dev --env dev --remote
```

Locally, `npm run db:migrate:local -w @mergemate/api` applies migrations to the local database used by `wrangler dev`.

## Queues and KV (one-time per environment)

GitHub webhook events go through a queue with a dead-letter queue. Create both:

```bash
npm exec -w @mergemate/api -- wrangler queues create mergemate-github-events-dev
npm exec -w @mergemate/api -- wrangler queues create mergemate-github-events-dev-dlq
```

Public posts are read from the KV namespace the staff tool publishes to. Add it to `wrangler.toml` as a `[[env.dev.kv_namespaces]]` block with binding `POSTS` and that namespace's id.

## GitHub App webhook

In the GitHub App settings, set the webhook URL to `https://api-dev.mergemate.dev/v1/webhooks/github` (production: `https://api.mergemate.dev/v1/webhooks/github`), set the secret to the `GITHUB_WEBHOOK_SECRET` value, mark it active, and subscribe to: Pull request, Pull request review, Pull request review comment, Issue comment, Check suite, Status. Installation events are always sent.

List what is set (names only): `npm exec -w @mergemate/api -- wrangler secret list --env dev`.

## Billing setup

Billing is test mode only in this version; production is disabled. Set Stripe test secrets locally in `.dev.vars` and configure `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL` with recurring test prices. Never use live keys. The REST client pins API version `2025-06-30.basil`; configure a test webhook destination at that version. No Stripe resources or secrets were created by this change.

Subscribe the test destination to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`. The Worker verifies the raw-body signature and timestamp, records a durable inbox entry, then queues the event ID. Provision each configured queue and its dead-letter queue only as part of an authorized deployment. Replaying a dead-letter message uses the existing pending inbox row; completed events are ignored. Do not remove pending events without reconciliation.

`getBillingPlan(env, userId)` exposes the verified stored entitlement for API consumers. `renewsAt` is null when cancellation is scheduled, with the end date in `cancelAt`. A billing operation interrupted while holding a customer lock fails closed; confirm the old request ended before an authorized operator clears its `operation_token`. A failed deletion keeps `deleting=1`, so new checkouts remain blocked until deletion is retried. Account deletion expires open checkouts and confirms cancellation of every remaining subscription before GitHub revocation and local data deletion.

Reference: [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [subscription cancellation](https://docs.stripe.com/api/subscriptions/cancel), [API versioning](https://docs.stripe.com/api/versioning).

## Push delivery

Set `EXPO_ACCESS_TOKEN` only as a Worker secret (or in local `.dev.vars`), and enable enhanced push security for the intended EAS project before deploying. The sender fails closed without its access token; no dashboard setting was changed or claimed verified by this implementation. Only mocked Expo requests were used in tests.

Internal integrations call `sendPushNotification(env, deps, { userId, kind, notificationId })` after verifying the recipient can access the corresponding repository. There is no public send endpoint. Kinds match the notification contract. Payload text is fixed per kind and contains no PR title, source code, credentials or repository name. The sender checks stored preferences and IANA-zone quiet hours before each attempt, uses active non-demo sessions, and authenticates every Expo request. Push expiration is capped at the next minute boundary to prevent provider retention across quiet-hour boundaries. Device display timing is controlled by the provider/OS, so already accepted notifications cannot be recalled.

`getSettings(env, userId)` exposes the stored preferences to other server features. `aiSummaries` is a preference, not AI consent: AI routes still require their existing consent gate. `quietHours: null` disables quiet hours; otherwise start/end are distinct HH:mm values and timeZone is an IANA zone.

Device tokens are scoped to user + device, capped atomically per user, and tied to their registering session. Session rotation reattaches registrations before the old session is removed; logout/expiry/account deletion cascade cleanup. Expired/idle sessions are excluded by the sender. Token ownership is not transferable across users without removing the previous registration. The scheduled receipt checker runs every 15 minutes once deployed, removes unregistered devices, protects refreshed tokens from stale receipts, and discards receipts after 24 hours. It never sends a notification. Tickets indicate Expo acceptance, not device delivery. Transport ambiguity is surfaced rather than automatically sending duplicates; one retry is allowed on explicit 429/5xx responses, with preferences checked again.

References: [Expo delivery and receipts](https://docs.expo.dev/push-notifications/sending-notifications/) and its enhanced push security section. No pushes, remote migrations or deployment were performed.

## User-provided Meta credentials

The API exposes GET /v1/settings/meta-key to signed-in web/iOS sessions and returns only { configured: boolean }. Demo reads return false. PUT /v1/settings/meta-key takes { key: string } and DELETE removes the saved key; both require a web cookie session, the configured WEB_ORIGIN and the existing CSRF token. Native bearer sessions cannot enter or remove keys. Client entry/status UI is supplied by the app lane; never retain the entered key in web storage or display a saved key.

A PUT performs one fixed prompt against the allowed Meta model with max_tokens=1, no retry, no repository data and no response-body logging. It stores a key only after verification succeeds. Rejected or unavailable verification leaves the previous key intact. This is a billed call against the supplied account, so the web client must explain the check before submission. Failed key use never falls back to the app credential. Normal session rate limits apply to verification and analysis.

Migration 0008_user_meta_keys.sql stores AES-256-GCM ciphertext with the same versioned TOKEN_ENCRYPTION_KEY / TOKEN_ENCRYPTION_KEY_PREVIOUS mechanism used for GitHub credentials, a fresh IV and user-specific associated data. No new Worker secret is introduced. Account deletion cascades the credential row; web DELETE removes it immediately. Never place a user's key in Worker configuration or .dev.vars examples. Production encryption rotation must retain the previous version until credentials using it have been replaced.

The analysis gate still enforces current consent, the user's plan/action cap and session rate limits. Meta-routed summary/risk calls use the saved key and bypass only the shared/global budget. Workers AI calls and users without a saved key retain the global budget. The reusable userModelContext helper carries the same rule for future model-backed routes. Meta requests disable gateway logging and caching explicitly, prevent wholesale billing fallback and limit the gateway to one attempt (the ordinary transport retains its existing one retry); the gateway itself must also have prompt/response logging off. Verification uses the configured MODEL_BASE_URL for the existing Meta provider and never accepts a URL or model from a client.

Owner smoke remains local. Configure ignored local values and apply local migrations only, then use a web cookie session and CSRF to inspect status, add/remove a test-account key and check that reads never return it. No real credential verification or provider request was performed during development; automated tests mock the provider. The small verification call is made only when the user submits their own key.
