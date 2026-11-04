# API secrets (one-time setup)

Non-secret settings live in `wrangler.toml` under `[vars]`. Secrets are set once per Worker environment with `wrangler secret put`, which prompts for the value so it never lands in shell history, the repo or a log. Locally, put the same names in `apps/api/.dev.vars` (git-ignored; names in `.dev.vars.example`).

Deploying is a separate, owner-run release step; this file only covers secrets. Wrangler needs Node 22 or newer.

Production (`api.mergemate.dev` and `app.mergemate.dev`) has its own section at the end of this file with every owner step in order.

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

Two more routes and one profile (names only; values are plain vars, never secrets). `MODEL_ROUTE_SEGMENT` (`meta:sam-3.1`, region boxes for Highlight; unset means off) and `MODEL_ROUTE_DECISION` (`workers-ai:@cf/cloudflare/clef` or `clef-flash`; typed-question probabilities through `createDecisionProvider().completeDecision()`, never free text). `meta:muse-spark-1.3` is also allowed on the text and highlight routes. `AI_PROFILE` is `hackathon` (the default when unset) or `prod`; any other value is a configuration error. The profile only supplies a default for a route whose var is unset: in `prod`, `MODEL_ROUTE_DECISION` defaults to `clef-flash`; in `hackathon` nothing is defaulted, so Clef is used only when `MODEL_ROUTE_DECISION` is set. Text routes always stay explicit. The risk check (`assessPrRisk`) uses the decision route as a fast classifier (`classifier` in `ai-engine-classifier.ts`): when a decision route resolves, it asks `needs_closer_look` once per head SHA (cached with the risk result, inside the same reserved action) and the "yes" probability becomes `classifierScore` (flagged at 0.7 or more). No decision route means no Clef call; any Clef failure falls back to rules-only quality. Request and answer field names are still unconfirmed against the live model, so set `MODEL_ROUTE_DECISION` and check the first call before relying on it. No `wrangler.toml` value changes with this: live routes stay on `meta:muse-spark-1.2` until the owner flips them.

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

## Agent run kill switch and per-user block

Operator-only KV keys in the `POSTS` namespace. They are not part of the public `flags:v1` document and are never served by `/v1/flags`. Agent runs are off unless `agent_runs:v1` is exactly `on`; any other value, a missing key or a KV error means off.

KV edits need your Cloudflare login, not the deploy-scoped API token, so each command unsets `CLOUDFLARE_API_TOKEN` and runs from `apps/api`.

```bash
# turn agent runs on / off
cd ~/code/mergemate/apps/api && env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --binding=POSTS --env dev --remote "agent_runs:v1" "on"
cd ~/code/mergemate/apps/api && env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --binding=POSTS --env dev --remote "agent_runs:v1" "off"

# block / unblock one user (any non-empty value blocks)
cd ~/code/mergemate/apps/api && env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --binding=POSTS --env dev --remote "agent_blocked:<userId>" "1"
cd ~/code/mergemate/apps/api && env -u CLOUDFLARE_API_TOKEN npx wrangler kv key delete --binding=POSTS --env dev --remote "agent_blocked:<userId>"
```

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

## Production (api.mergemate.dev + app.mergemate.dev)

Everything the owner runs, in order. Run from the repository root with the Cloudflare login already in place. `[env.production]` in `apps/api/wrangler.toml` and `apps/web/wrangler.toml` is already complete except the ids marked `OWNER-PASTE`. Production deploys `origin/main`, so the config PR and the release PR (development to main) both land before step 9. No variable name changes: production uses the names in `.dev.vars.example`.

If a create command offers to add the new resource to your config, answer no; the ids go in `wrangler.toml` through a PR (step 5), so none of these commands changes a file.

1. Database. Prints the `database_id`.

```bash
npm exec -w @mergemate/api -- wrangler d1 create mergemate-db
```

2. Posts store (KV). Prints the namespace `id`.

```bash
npm exec -w @mergemate/api -- wrangler kv namespace create POSTS
```

3. Queues: GitHub events and Stripe events, each with a dead-letter queue (Stripe stays disabled, but the Worker binds the queue).

```bash
npm exec -w @mergemate/api -- wrangler queues create mergemate-github-events
npm exec -w @mergemate/api -- wrangler queues create mergemate-github-events-dlq
npm exec -w @mergemate/api -- wrangler queues create mergemate-stripe-events
npm exec -w @mergemate/api -- wrangler queues create mergemate-stripe-events-dlq
```

4. Highlight uploads bucket (private; never attach a public domain) and its 1-day expiry rule.

```bash
npm exec -w @mergemate/api -- wrangler r2 bucket create mergemate-highlight-uploads
npm exec -w @mergemate/api -- wrangler r2 bucket lifecycle add mergemate-highlight-uploads expire-uploads-1d --expire-days 1 -y
```

The two Analytics Engine datasets (`mergemate_events`, `mergemate_ai_metrics`) are created on first write; there is nothing to create. Workers AI and Image Transformations need no resource.

5. Send the two ids (the D1 `database_id` and the KV `id`) to the agent. They are not secrets. The agent replaces the two `OWNER-PASTE` ids in `[[env.production.d1_databases]]` and `[[env.production.kv_namespaces]]` in a small PR; merge it, then the development to main release PR.

6. GitHub App. Production uses its own GitHub App, separate from the dev one (a GitHub App has one webhook URL, and tokens and installations are per App). Create it with the same read-only permissions and the same event subscriptions as the dev App (see "GitHub App webhook" above), then set:
   - Callback URL: `https://app.mergemate.dev/auth/callback`
   - Webhook URL: `https://api.mergemate.dev/v1/webhooks/github`, active, with a new webhook secret (the value you set as `GITHUB_WEBHOOK_SECRET` in step 7)
   - Generate a client secret (step 7 `GITHUB_APP_CLIENT_SECRET`)

   Send the App's client id and slug to the agent. They are public. The agent puts them in `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_SLUG` under `[env.production.vars]` in the same PR as step 5 (or a follow-up). Until then GitHub sign-in cannot work.

7. Secrets. Each command prompts for the value, so it never lands in shell history. Use values made for production, never the dev ones. For `TOKEN_ENCRYPTION_KEY`, this prints a fresh value to paste:

```bash
printf '1:%s\n' "$(openssl rand -base64 32)"
```

```bash
npm exec -w @mergemate/api -- wrangler secret put MODEL_API_KEY --env production
npm exec -w @mergemate/api -- wrangler secret put GITHUB_APP_CLIENT_SECRET --env production
npm exec -w @mergemate/api -- wrangler secret put GITHUB_WEBHOOK_SECRET --env production
npm exec -w @mergemate/api -- wrangler secret put TOKEN_ENCRYPTION_KEY --env production
npm exec -w @mergemate/api -- wrangler secret put RESEND_API_KEY --env production
npm exec -w @mergemate/api -- wrangler secret put EMAIL_FROM --env production
npm exec -w @mergemate/api -- wrangler secret put SUPPORT_EMAIL --env production
npm exec -w @mergemate/api -- wrangler secret put TURNSTILE_SECRET_KEY --env production
```

If wrangler says the Worker does not exist yet and offers to create it with the secret, answer yes; the deploy in step 9 replaces it. Not set on purpose: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (billing is disabled in production) and `EXPO_ACCESS_TOKEN` (push stays off until it is set). Check what is set (names only):

```bash
npm exec -w @mergemate/api -- wrangler secret list --env production
```

8. Turnstile. In the Cloudflare Turnstile widget that the web build and `TURNSTILE_SECRET_KEY` belong to, make sure `app.mergemate.dev` is in the hostname list (keep `mergemate.dev` and `localhost`). The web build already carries the widget's public site key; the CSP already allows `challenges.cloudflare.com`.

9. Release. This builds the web export against `https://api.mergemate.dev`, deploys `origin/main` for the API then the web Worker, asks for the typed `DEPLOY PROD` confirm for each, and gates the D1 migrations behind a backup and the typed `APPLY MIGRATIONS`. The custom domains `api.mergemate.dev` and `app.mergemate.dev` are created by the deploy (the `mergemate.dev` zone is in the same account). Production is protected, so the approval word is required:

```bash
release.sh mergemate prod api web --approved release
```

If the first run stops at the backup step with "backup is missing or empty" (an empty new database), apply the migrations once by hand and run the release line again:

```bash
npm exec -w @mergemate/api -- wrangler d1 migrations apply mergemate-db --env production --remote
```

10. Verify. Each returns 200 with a small JSON body:

```bash
curl -fsS https://api.mergemate.dev/v1/health
curl -fsS https://app.mergemate.dev/health
```

Rollback is `npm exec -w @mergemate/api -- wrangler rollback --env production` (Worker code only; database changes do not roll back, so use the backup the release line printed).

### Voice usage metrics

Voice notes reuse the existing AI_METRICS binding/dataset and need no new environment variable, permission or migration. One best-effort point is written for each logical transcription, including its existing retry time: blobs remain `[task, provider, model, outcome]` with task `voice`, provider `meta` and model `muse-voice-transcribe-1.0`. Token counts are zero, and latency remains double3. Voice appends double4 (audio seconds from the validated WAV header), double5 (whole seconds rounded down per recording for the audio-rate estimate), and double6 (duration-known flag, 1 or 0). Non-voice points retain their existing three doubles. Formats without a trusted duration carry zeros with flag 0 and must be shown as unpriced, not free. No point is emitted for local validation, flag, consent, budget or configuration rejection before transcription. Audio, transcript, filename, identity, request ID and credentials are never included in the point. A missing/failing metrics binding does not fail transcription.

The paired private admin metrics page weights the audio fields by sampling interval and estimates voice separately from tokens at $0.18/audio hour ([Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits), checked 2026-10-27). This is an estimate from submitted audio, not reconciled provider billing: retries and provider rejections may differ. This PR does not enable voice, change its format acceptance or limits, call the provider, or deploy either Worker.
