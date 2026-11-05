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
EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile
npx --no-install wrangler deploy --dry-run --config apps/web/wrangler.toml --env dev
```

Dev browser builds use `/__api`, served by the existing web Worker proxy and pinned dev API service binding. `API_ORIGIN` is the Worker's upstream identity; it is not the dev browser's base URL. The dev CSP intentionally excludes direct connections to api-dev.mergemate.dev. `app.config.ts` rejects that mismatched web export; native dev builds still use the direct API origin. The manifest link uses `crossorigin="use-credentials"` so the browser includes its existing Access cookie when fetching the protected same-origin manifest. This does not grant access or widen CSP.

## Deploying

Production (`app.mergemate.dev`) ships together with the API: the ordered owner steps are in `apps/api/DEPLOY.md`, section "Production". The Turnstile widget behind the build's public site key must list `app.mergemate.dev`.

Maintainer releases build the web export for the selected stage and deploy it through the approved release process. There are no owner one-time steps beyond the custom domain, and the deploy creates that: `dev.mergemate.dev` and `app.mergemate.dev` must be on a Cloudflare zone in the same account (`mergemate.dev` already is).

The Expo export contains no inline scripts. It does contain an inline `<style>` and react-native-web injects styles at runtime, so `style-src` keeps `'unsafe-inline'`; `script-src` never does.

## Verified native links

The Worker serves `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` as JSON without redirects. Both return non-cacheable 503 until their actual non-secret signing identifiers are configured. No fabricated certificate or Apple identity is published. Configured documents cache for one hour.

Set `ANDROID_SHA256_FINGERPRINTS` in the appropriate Wrangler environment to the actual SHA-256 signing certificate fingerprint(s). Production authorizes only the production Android package; dev authorizes only the dev package. Set `IOS_APP_ID` to the actual application-identifier entitlement (Apple app-ID prefix followed by the configured iOS bundle identifier). Neither value is a private key. Commit reviewed public identifiers through configuration; never invent them or copy a dev certificate into production.

Native variants request their environment's associated domain. Verified HTTPS links support OAuth callbacks and PR paths. Native browser sessions use the registered `mergemate://auth/callback` return when HTTPS association does not open the app; the web relay forwards only code/state, with PKCE verification retained in the native secure store. The native marker is in OAuth state, not an added callback query parameter. See [the current auth lifecycle](../../docs/AUTH_LIFECYCLE.md).

Real association, browser return, cold/warm launch and credential persistence require signed-device acceptance. Local fixtures and JavaScript exports do not certify those behaviors. Signing identifiers are intentionally unconfigured in this snapshot.

## Installable app, offline page and browser notifications

The export ships `manifest.webmanifest`, install icons, `offline.html` and `sw.js`. Release web builds register the service worker on load; registering never asks for permission. The worker caches only `/offline.html` (static, no account or PR data) and shows it when a page load fails. Page loads always come from the network; API calls, scripts and images are never intercepted or cached. `sw.js` is served `no-cache` and registered with `updateViaCache: "none"`, so a release replaces it on the next check and old `mergemate-` caches are removed on activate.

Browser notifications stay hidden until the API environment has a Web Push key pair: `VAPID_PUBLIC_KEY` in `apps/api/wrangler.toml` (public) and `VAPID_PRIVATE_KEY` set with `wrangler secret put` (never committed). `node apps/api/scripts/vapid-keys.mjs` prints a pair; use one pair per environment. The permission prompt appears only when the person turns on the switch in Settings. Turning it off, signing out, a session ending or someone else signing in on the same browser removes the browser subscription. Notification clicks open MergeMate pages on this origin only.

Fixture browser check: build the web export with its dev API URL, then run `node apps/mobile/scripts/check-pwa.mjs` from the repository root (set `CHROMIUM_PATH` to an installed Chromium if Playwright's own browser is not downloaded). It serves the export locally, intercepts API traffic, and checks at 393px and 1440px: one worker at scope `/`, only `/offline.html` cached, the offline page when the site is unreachable, recovery when it is back, and no permission prompt or subscription on load. Screenshots go to `MM_PWA_PROOF_DIR` (a temporary directory by default). Real delivery through a browser push service needs the owner's key pair and is a release check.
