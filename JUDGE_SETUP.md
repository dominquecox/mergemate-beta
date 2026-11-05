# Run and review MergeMate

Use Node 22 or newer and npm from the repository root. This is a complete source snapshot with example deployment configuration, not credentials for the hosted service. The original source revision and changes are in [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).

## Credential-free sample walkthrough

```bash
npm ci --ignore-scripts
NODE_PATH="$PWD/apps/mobile/node_modules" npm run web -w @mergemate/mobile
```

The `NODE_PATH` setting lets the Expo CLI resolve the workspace-local router after a clean npm install; it does not disable TypeScript checking or change the app. Keep `EXPO_PUBLIC_API_BASE_URL` unset and do not copy `.env.example` for this sample-only path. Open the localhost address printed by Expo (normally http://localhost:8081). Development mode uses built-in, labeled samples when no API base is set. An exported production build deliberately refuses a missing API URL.

Open the sample Inbox, then PR7 (low-risk scaffold), PR412 (auth/database risk) and PR9 (visual inspection sample). Try the Triage Deck and desktop keys1/2/3/Z. Samples make no real GitHub or model calls. A canned visual response is not live SAM/vision proof. Local readout requires an installed supported voice; browser/device support varies.

## Reproduce automated gates

```bash
npm run typecheck
npm run lint
npm test -w @mergemate/mobile
npm test -w @mergemate/api
npm test -w @mergemate/contracts
EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile
npm test -w @mergemate/web
node apps/site/scripts/check.mjs
npm run security:bundles
```

The export in this sequence is for same-origin local fixture verification. It is not a hosted release. Web tests run after export because some inspect generated legal pages. `security:bundles` queries dependency advisories and packages web/iOS/Android JavaScript and the API; it does not compile native apps, deploy or upload. A passing bundle assessment does not mean npm tooling has no advisories.

For browser fixtures, install Playwright Chromium or use the Chromium path supported by each harness. The mobile polish/session harnesses expect `/usr/bin/chromium`. Build with `/__api` as above, then run:

```bash
node apps/mobile/scripts/check-mobile-polish.mjs
node apps/mobile/scripts/check-session-lifecycle.mjs
```

These use isolated browser contexts and mocked API/speech transports. No personal session, provider key or private device is needed. They are not live integration acceptance.

## Real integrations

For a real local API, create a git-ignored `apps/api/.dev.vars` using the variable names in its example, configure an authorized GitHub App and Meta/provider credentials, and apply **local** migrations before running the API:

```bash
npm run db:migrate:local -w @mergemate/api
npm run dev -w @mergemate/api
```

In a separate terminal:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787 NODE_PATH="$PWD/apps/mobile/node_modules" npm run web -w @mergemate/mobile
```

The GitHub App must register its exact callback and authorized webhook/permissions as documented; a custom callback parameter is not required. Some OAuth/model integrations require reachable configured hosts and consent. Never point test migrations at a remote service or embed secrets in `EXPO_PUBLIC_*`. Use your own resources; copied placeholder deployment identifiers are intentionally non-operational.

Native push/signing/verified links require your own Expo project, application association identifiers and signing setup. They are not prerequisites for sample web review. No native build, store upload, production deployment or submission is part of these instructions. Historical implementation documents describe checks at their recorded revisions; current runtime behavior is governed by the source and this snapshot's validation record.
