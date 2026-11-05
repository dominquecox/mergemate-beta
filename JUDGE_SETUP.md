# Run and review MergeMate

Use Node 22 or newer and npm from the repository root. This is a complete source snapshot with example deployment configuration, not credentials for the hosted service. The original source revision and changes are in [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).

## Credential-free sample walkthrough

```bash
npm ci --ignore-scripts
NODE_PATH="$PWD/apps/mobile/node_modules" npm run web -w @mergemate/mobile
```

The `NODE_PATH` setting lets the Expo CLI resolve the workspace-local router after a clean npm install; it does not disable TypeScript checking or change the app. Keep `EXPO_PUBLIC_API_BASE_URL` unset and do not copy `.env.example` for this sample-only path. Open the localhost address printed by Expo (normally http://localhost:8081). Development mode uses built-in, labeled samples when no API base is set. An exported production build deliberately refuses a missing API URL.

Open the sample Inbox, then PR7 (low risk), PR412 (auth and database risk) and PR9 (visual sample). Try the Triage deck with keys 1, 2, 3 and Z. Samples make no GitHub or model calls. The live beta is at [app.mergemate.dev](https://app.mergemate.dev).

## Checks

```bash
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test -w @mergemate/api
```

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

Register your GitHub App's callback URL and permissions, and use your own resources: the deployment identifiers in this copy are placeholders. Never put secrets in `EXPO_PUBLIC_*`.
