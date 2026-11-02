# Commit-bound QA evidence

MergeMate combines PR risk context with execution evidence. The QA Evidence card separates GitHub check runs from legacy status reports, shows reported provider/timing and matches each run to the currently loaded head. A check without a reported head is not counted as current execution. A successful build is not proof of browser or native-device coverage. Pagination, missing results and unknown provenance stay visible.

## Local browser runner

The runner is operator-invoked, not a cloud service or a GitHub Actions workflow. Use a trusted, reviewed checkout of the private MergeMate working repository, Node22.18+ or24 (native TypeScript stripping), installed locked dependencies, GitHub CLI read access, and an installed Chromium-compatible browser. The supplied harnesses default to `/usr/bin/chromium` on Linux and Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS. Set `CHROMIUM_PATH` to a different trusted browser executable when needed; no test-source edit is required. Do not run unreviewed PR code or dependency hooks merely because a PR exists.

The checkout must be clean and exactly match the open PR's full head SHA. Forks, other repositories and public copies are rejected. Read the actual PR revision first, then run from the repository root:

```bash
gh pr view NUMBER --repo dominquecox/mergemate --json headRefOid
npm run qa:run -- --pr NUMBER --head FULL_COMMIT_SHA
```

For this trusted repository, the PR card also offers **Copy desktop QA command** with the exact PR/head. Run the copied command only in the matching reviewed checkout. Copy failures are shown explicitly.

The command checks local HEAD, origin, cleanliness and the GitHub PR identity. It builds the web app with same-origin fixture transport, then executes the committed mobile-polish and session-lifecycle browser journeys. Commands are a fixed allowlist; no command, model output or script path from a submitted report/PR body is executed. Ignored dotenv files and inherited public client credentials are excluded from the fixture export. No live GitHub sign-in, model request, native build, deployment, workflow or remote migration is triggered.

Each run gets a private temporary folder containing `report.json`, bounded per-suite logs and screenshots under `artifacts/`. The command prints its location. Report metadata includes exact PR/head, actual suite outcomes/exit codes and durations, scope, and screenshot byte lengths/SHA256. Artifact symlinks, excessive counts/sizes and checkout/PR changes during execution fail closed; incomplete suites are not passing. Timeout, cancellation and output-limit outcomes retain distinct labels. A nonzero exit remains nonzero. A per-checkout lock rejects concurrent runs. Logs and screenshots are never uploaded automatically; keep them private and inspect them before sharing.

Scope is explicitly **browser-fixtures**: these journeys drive the real exported UI with local API and speech fixtures. API unit/integration tests are separate. Neither establishes real OAuth, live inference, native speech, a physical software keyboard or signed-device acceptance. Report JSON is an operator receipt, not a signature or independent attestation.

## Inspecting a local report in the app

Open the matching PR, find QA Evidence and choose **Inspect local QA report**. Paste only `report.json`, not logs, source maps, tokens or private environment files. The64KB schema rejects unknown fields, wrong repository/PR/head, impossible or future timestamps, reports older than48hours, contradictory outcomes and unsafe artifact paths. No API or model request is made when inspecting a report.

A report stays only in that screen's memory, clears on PR/head/account changes and is explicitly user-supplied. A failed or invalidated run remains failed/invalidated. Screenshot hashes identify the operator's artifacts; the report does not upload or display those private files. Inspect screenshots in the actual run folder. Imported claims cannot establish trust on their own and never remove security findings or upgrade the executive verdict.

## Regression checks

```bash
node --test scripts/qa-runner.test.mjs
npm test -w @mergemate/mobile
npm test -w @mergemate/api
npm test -w @mergemate/contracts
npm run typecheck
npm run lint
EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-qa-evidence.mjs
npm test -w @mergemate/web
npm run security:bundles
```

The UI harness checks current/stale/legacy evidence, report mismatch/failure, head-change clearing and the no-check state at360/393/1440px. External transports remain fixtures; no passing receipt is invented for missing CI. Existing workflows stay off. This increment does not claim generic autonomous test generation, self-healing tests, arbitrary-PR sandbox execution or full desktop/mobile coverage.
