# API secrets (one-time setup)

Non-secret settings live in `wrangler.toml` under `[vars]`. Secrets are set once per Worker environment with `wrangler secret put`, which prompts for the value so it never lands in shell history, the repo or a log. Locally, put the same names in `apps/api/.dev.vars` (git-ignored; names in `.dev.vars.example`).

Deploying is a separate, owner-run release step; this file only covers secrets. Wrangler needs Node 22 or newer.

Run from the repository root. Each command sets one secret for the `dev` environment (`mergemate-api-dev`); swap `--env dev` for `--env production` for `mergemate-api`.

| Secret | Used for |
| --- | --- |
| `MODEL_API_KEY` | AI provider key (server-side only) |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App sign-in |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App installation tokens (PKCS8 PEM) |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook signature check |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored GitHub tokens. Format `<version>:<base64 32 bytes>`; to rotate, move the old value to `TOKEN_ENCRYPTION_KEY_PREVIOUS` and set a new version |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature check |
| `RESEND_API_KEY` | Transactional email |
| `TURNSTILE_SECRET_KEY` | Bot check on public forms |

```bash
npm exec -w @mergemate/api -- wrangler secret put MODEL_API_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put GITHUB_APP_CLIENT_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put GITHUB_APP_PRIVATE_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put GITHUB_WEBHOOK_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put TOKEN_ENCRYPTION_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put STRIPE_SECRET_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put STRIPE_WEBHOOK_SECRET --env dev
npm exec -w @mergemate/api -- wrangler secret put RESEND_API_KEY --env dev
npm exec -w @mergemate/api -- wrangler secret put TURNSTILE_SECRET_KEY --env dev
```

## Database (one-time per environment)

Create the D1 database, put the printed `database_id` in a `[[env.dev.d1_databases]]` block (binding `DB`, `database_name = "mergemate-db-dev"`, `migrations_dir = "migrations"`) in `wrangler.toml`, then apply migrations:

```bash
npm exec -w @mergemate/api -- wrangler d1 create mergemate-db-dev
npm exec -w @mergemate/api -- wrangler d1 migrations apply mergemate-db-dev --env dev --remote
```

Locally, `npm run db:migrate:local -w @mergemate/api` applies migrations to the local database used by `wrangler dev`.

List what is set (names only): `npm exec -w @mergemate/api -- wrangler secret list --env dev`.

## Billing setup

Billing is test mode only in this version; production is disabled. Set Stripe test secrets locally in `.dev.vars` and configure `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL` with recurring test prices. Never use live keys. The REST client pins API version `2025-06-30.basil`; configure a test webhook destination at that version. No Stripe resources or secrets were created by this change.

Subscribe the test destination to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`. The Worker verifies the raw-body signature and timestamp, records a durable inbox entry, then queues the event ID. Provision each configured queue and its dead-letter queue only as part of an authorized deployment. Replaying a dead-letter message uses the existing pending inbox row; completed events are ignored. Do not remove pending events without reconciliation.

`getBillingPlan(env, userId)` exposes the verified stored entitlement for API consumers. `renewsAt` is null when cancellation is scheduled, with the end date in `cancelAt`. A billing operation interrupted while holding a customer lock fails closed; confirm the old request ended before an authorized operator clears its `operation_token`. A failed deletion keeps `deleting=1`, so new checkouts remain blocked until deletion is retried. Account deletion expires open checkouts and confirms cancellation of every remaining subscription before GitHub revocation and local data deletion.

Reference: [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [subscription cancellation](https://docs.stripe.com/api/subscriptions/cancel), [API versioning](https://docs.stripe.com/api/versioning).
