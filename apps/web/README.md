# MergeMate web host

A small Cloudflare Worker that serves the Expo web export (`apps/mobile/dist`) and adds the security headers from the security spec: a strict CSP (no inline or eval scripts, `connect-src` limited to this app and its API host, `frame-ancestors 'none'`), HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. HTML is `no-cache`; hashed `/_expo/` files are immutable. Unknown paths fall back to the app shell (single-page app). `GET /health` returns `{ "ok": true }`.

| Environment | Worker | Host | `API_ORIGIN` |
| --- | --- | --- | --- |
| local | `mergemate-web` | `wrangler dev` | `http://localhost:8787` |
| dev | `mergemate-web-dev` | `dev.mergemate.dev` | `https://api-dev.mergemate.dev` |
| production | `mergemate-web` | `app.mergemate.dev` | `https://api.mergemate.dev` |

`API_ORIGIN` feeds the CSP and must be the same origin the app was built against (`EXPO_PUBLIC_API_BASE_URL`). A missing or malformed value makes the Worker answer 500 rather than widen the policy.

## Local run

From the repository root:

```bash
npm ci
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787 npm run export:web -w @mergemate/mobile
npm run dev -w @mergemate/web
```

Checks: `npm run typecheck -w @mergemate/web`, `npm run lint -w @mergemate/web`, `npm run test -w @mergemate/web`. A deploy dry run (no Cloudflare calls) needs the export first:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
npx --no-install wrangler deploy --dry-run --config apps/web/wrangler.toml --env dev
```

## Deploying

Production (`app.mergemate.dev`) ships together with the API: the ordered owner steps are in `apps/api/DEPLOY.md`, section "Production". The Turnstile widget behind the build's public site key must list `app.mergemate.dev`.

Deploys go through the Brain release line, which builds the export for the stage and runs `wrangler deploy` (see the release rules). There are no owner one-time steps beyond the custom domain, and the deploy creates that: `dev.mergemate.dev` and `app.mergemate.dev` must be on a Cloudflare zone in the same account (`mergemate.dev` already is).

The Expo export contains no inline scripts. It does contain an inline `<style>` and react-native-web injects styles at runtime, so `style-src` keeps `'unsafe-inline'`; `script-src` never does.

## TODO

- `/.well-known/apple-app-site-association` (and `assetlinks.json` for Android) is not served yet. It needs the owner's Apple team id; add it to both hosts when that exists, with `Content-Type: application/json` and no redirect. Until then the single-page fallback would answer that path with the app shell, which is not a valid association file.
