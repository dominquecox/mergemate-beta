# Site operations

This site has a separate Worker and waitlist database. Only `public/` is served. It does not import the product API. The supplied wordmarks and icon are WebP exports of the approved app assets; the review inbox is an illustrative layout with sample projects.

## Local verification

Use Node 22 or newer and run from the repository root. The site uses the workspace's existing, locked tooling; it adds no dependencies and does not modify another lane's package files. Its check is explicit until a separate tooling card adds it to the root workspace command.

```sh
npm ci
node apps/site/scripts/check.mjs
npm audit --audit-level=high
npx --no-install wrangler d1 migrations apply mergemate-waitlist-db --local --config apps/site/wrangler.toml
npx --no-install wrangler dev --local --config apps/site/wrangler.toml --ip 127.0.0.1 --port 8783
```

For local form checks, create a git-ignored `apps/site/.dev.vars` using local test configuration. Never copy production secrets into browser tests. An unconfigured form shows an unavailable message and fails closed. Do not send real email during automated checks.

In another terminal, with an existing Playwright installation available:

```sh
node apps/site/scripts/smoke.mjs
```

`PLAYWRIGHT_MODULE` may point to an installed Playwright module and `CHROME_EXECUTABLE` to an existing headless Chrome binary. The browser check uses an isolated profile and mocks the challenge and signup responses; API tests invoke the real handler against local D1 with mocked external services. No live provider or deliverability proof is implied. Screenshots go to `/tmp/mergemate-site-smoke` by default. The browser check covers 360, 393, 1280 and 1440 pixels, light/dark themes, both forms, errors, FAQ, legal pages, blocked files and overflow.

After editing an asset, regenerate its filename and all HTML references:

```sh
node apps/site/scripts/rehash.mjs
```

## First production setup — owner only

Use a clean, isolated checkout of the reviewed site branch with dependencies installed. These commands are run from its repository root. Keep other agents' working copies untouched. No command below has been executed against production by the site agent.

1. Create the database once (skip creation if the named database already exists), then obtain its non-secret metadata:

```sh
npx --no-install wrangler d1 create mergemate-waitlist-db --config apps/site/wrangler.toml
npx --no-install wrangler d1 info mergemate-waitlist-db --json --config apps/site/wrangler.toml > /tmp/mergemate-site-db.json
node --input-type=module - <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const metadata = JSON.parse(readFileSync('/tmp/mergemate-site-db.json', 'utf8'));
const id = metadata.uuid;
if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Database UUID missing; check the D1 metadata before continuing.');
const path = 'apps/site/wrangler.toml';
const config = readFileSync(path, 'utf8');
if (!config.includes('00000000-0000-0000-0000-000000000000')) throw new Error('Database already configured; inspect before changing it.');
writeFileSync(path, config.replace('00000000-0000-0000-0000-000000000000', id));
JS
npx --no-install wrangler d1 migrations apply mergemate-waitlist-db --remote --config apps/site/wrangler.toml
```

The sentinel UUID in source is only for local simulation. Wrangler's TOML config cannot be automatically patched by `d1 create --update-config`; the metadata step above avoids manually copying an ID. The migration must exist before the first release because the release backup gate expects an existing database. Do not run migrations against another product database.

2. In Cloudflare Turnstile, create or select the site widget, allow `mergemate.dev` and `localhost` (also `127.0.0.1` if using that local host), and use the public site key as `TURNSTILE_SITE_KEY` in `apps/site/wrangler.toml`. The server checks the widget action `waitlist` and the hostname. Keep test keys local. The browser can read the site key; it can never read the secret key.

3. Verify the sending domain `ploonu.com` in Resend and ensure the fixed sender `mergemate@ploonu.com` can send. Public replies go to `support@mergemate.dev`; confirm that mailbox routing works. Put the two secrets interactively, without placing their values in commands or commits:

```sh
npx --no-install wrangler secret put TURNSTILE_SECRET_KEY --config apps/site/wrangler.toml
npx --no-install wrangler secret put RESEND_API_KEY --config apps/site/wrangler.toml
```

`secret put` creates/deploys a Worker version. Treat this as an owner-approved setup action, not as a harmless config edit. On a first Worker it may offer to create it; do not serve the site until both secrets and the real public site key are present. The signup API returns unavailable on missing secret configuration. Subsequent releases preserve secrets.

4. Review and commit only the non-secret config changes on the site branch. Regenerate types and rerun the local gate before merging. Ploonu LLC must confirm the governing-law provision in the Terms before product launch; the current page explicitly leaves it unconfirmed.

```sh
npx --no-install wrangler types apps/site/worker-configuration.d.ts --config apps/site/wrangler.toml --env-interface SiteBindings --include-runtime false --strict-vars false
node apps/site/scripts/check.mjs
npx --no-install wrangler deploy --dry-run --config apps/site/wrangler.toml
```

5. The routes in `wrangler.toml` attach `mergemate.dev` and `www.mergemate.dev` as custom domains during the approved release. The account must control that zone. Resolve any pre-existing conflicting DNS record in Cloudflare before release. The `www` host redirects permanently to the apex. Workers.dev and version-preview URLs are disabled. The site's web application is a separate host and is not deployed by this card.

6. CTO reviews; owner merges the ready PR to `development`, then merges an approved release PR from `development` to `main`. CI remains off. Use the shared release runner's `mergemate prod site` piece from current the release tools after its release configuration is merged; production deploys from `main`. The private handoff contains the complete owner release command. Do not use a direct `wrangler deploy` to bypass the release runner.

## Acceptance after release

Open the apex on phone and desktop; check both forms with the real widget and an owner-controlled email address. Confirm one email arrives, contains a working removal link, and a duplicate signup does not send again. Check removal twice and verify the database record is gone. Test the `www` redirect, `/api/health`, all legal pages, robots and sitemap. Confirm `/wrangler.toml`, `/README.md`, `/package.json`, `/.gitignore`, `/migrations/` and `/docs/` return 404, including browser navigations. No live signup count or list export is exposed.

`email_status=sent` records acceptance by Resend, not inbox delivery. A send failure leaves the signup intact with `failed`; duplicates do not retry delivery. Support can handle removal requests when a confirmation is missing. This first version has no automatic email retry, export, or launch-mail sender.

The local tests cover request-level rate-limit handling; the production binding is Cloudflare's per-location rate limiter, not a global exact counter. Request invocation logs and traces are disabled because removal links contain bearer tokens in their query string. Code logs only a fixed operational failure event, never addresses, request bodies or tokens.

Reference: [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/binding/), [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
