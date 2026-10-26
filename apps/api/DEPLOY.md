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
