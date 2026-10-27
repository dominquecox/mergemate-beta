# Local visual review

The visual harness runs the exported application with an ephemeral localhost server and isolated Google Chrome contexts. API responses are synthetic fixtures; other remote requests are blocked. It never uses a signed-in browser profile or live account.

From the repository root:

```sh
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-mm047.example npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/mm047-visual.mjs
```

The harness captures all routes, each onboarding card, startup, error and empty states at 393px and 1440px in dark and light. It also checks search filtering, repository search, PR file disclosure, adding a local note, prohibited GitHub actions, page overflow and browser errors. The synthetic API must remain the build-time address for this run.

Screenshots and results go to `/private/tmp/mm047-proof`, outside the repository. Attach review images to the PR body with GitHub CLI `--attach`; do not commit screenshot or result files. Billing and checkout remain web-only routes. The iOS JavaScript export verifies that shared font assets bundle, but does not replace a device or simulator smoke test.
