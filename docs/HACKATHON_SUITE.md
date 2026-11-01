# Complete hackathon suite

The suite adds native PanResponder triage with a web pointer-capture equivalent, inline revision-bound image comparison, full-screen inspection, and a sticky executive action bar.

## User flows

- Drag left/right/up to Ignore / Needs you / FYI. Stamps appear at 80pt; release commits beyond 120pt horizontal or 100pt upward. Below-threshold releases spring back. Save failure restores the current card; busy gestures lock competing decisions. Keyboard 1/2/3/Z and the existing buttons remain available. Reduced motion skips the exit animation.
- Image changes show before/after previews above Files Changed. Select an asset, then request analysis explicitly. Full-screen inspection carries PR, asset and revision context and uses read-only metadata/files requests; opening it does not request AI summaries or risk analysis.
- Demo previews are labeled schematic fixtures. Show Sample UI Inspection displays a known 32pt sample region, not a model result. Live analysis requires the existing Highlight flag and consent.
- Approve & Ship opens a confirmation sheet and hands the reviewer to GitHub. MergeMate does not approve, merge or enable auto-merge. Required checks and permissions remain GitHub's responsibility. Missing risk, incomplete coverage or pending checks direct the reviewer to desktop review.
- Queue for Desktop records Needs you using the existing triage store. Request Senior Review copies a formatted risk/blast-radius brief. Share Verdict uses the native share sheet and falls back to clipboard where sharing is unsupported. Errors are announced without claiming success.

## API and privacy

Visual previews use the signed-in user's GitHub token on the server, verify PR access and changed-file membership, and resolve before/after commits (including renamed and fork assets). A stale supplied head is rejected. Tokens and GitHub download URLs never reach the client. Images are bounded, decoded/rasterized to PNG, stripped of metadata, and returned with private/no-store caching; no screenshot is persisted.

Real previews require GitHub contents-read access and the existing Images binding. Denied access, oversized/absent assets or unsupported decoding produce a per-panel error and retry. Static SVG shapes are filtered to reject active content, entities, styles and external resources before trusted rasterization. Active SVG markup is never rendered in the app.

The shared UiSegment contract uses normalized [ymin, xmin, ymax, xmax] coordinates, point-size estimates, a recomputed >=44pt compliance flag and an optional HIG warning. Model claims do not override dimension checks. Point scale may be unknown: absent metrics remain absent instead of being invented from screenshot pixels. A screenshot is not proof of actual rendered hit targets.

MODEL_ROUTE_HIGHLIGHT can select workers-ai:@cf/meta/llama-3.2-11b-vision-instruct. This route uses Workers AI's image-byte input. Existing Meta/SAM routes, other vision routes and fallback behavior remain available. No runtime model route or live feature flag is changed by this PR.

## Reproduce local checks

From the repository root:

```sh
npm test -w @mergemate/api
npm test -w @mergemate/mobile
npm test -w @mergemate/web
npm test -w @mergemate/contracts
npm run typecheck
npm run lint
EXPO_PUBLIC_API_BASE_URL=/__api npm --prefix apps/mobile run export:web
```

For the isolated sample browser walkthrough, start Metro with no API base variable set:

```sh
EXPO_NO_TYPESCRIPT_SETUP=1 EXPO_OFFLINE=1 npm exec -w @mergemate/mobile -- expo start --web --port 8085 --clear
MM_SUITE_ORIGIN=http://localhost:8085 node apps/mobile/scripts/check-hackathon-suite.mjs
```

The harness uses installed /usr/bin/chromium, sample accounts and no live credentials. It verifies 393px/1440px confirmation/cancel, clipboard handoff, desktop queue, visual overlays/full-screen context, below-threshold recovery, all three swipe directions, undo/hotkeys and no GitHub/model mutations. Screenshots go to /tmp/mergemate-suite-proof. This is browser and unit evidence; physical-device gestures, native clipboard/share behavior and real provider output require device/live-host validation. The Expo-SDK-pinned expo-clipboard module is a new native dependency; bare/native clients must rebuild to include it.

No deployment, GitHub permission escalation, CI enablement, migration or production change is performed by this suite.
