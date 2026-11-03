# PR search (J-014)

Search covers open pull requests accessible to the signed-in GitHub user. It is separate from the Inbox and does not hide Done, Snoozed or muted Inbox rows. Title, exact repository, exact author and updated-date filters run in the GitHub search request. Risk filtering runs on the server against the user's saved assessment for the current PR commit, after rechecking access and the current head. Search does not call a model or assess each result automatically.

## Filters and privacy

Title search accepts up to eight literal terms, 120 characters total; it targets PR titles rather than pretending that a locally filtered Inbox page is full search. Query operators/quotes/backslashes are rejected. Repository is `owner/repository`; author is a GitHub username. Dates are real calendar days in UTC: From includes midnight; Through includes the whole selected day and excludes the following midnight. Empty date inputs remove that filter. Invalid or reversed dates show an error and send no search request.

All risk levels shows search results without additional per-row risk reads/badges. High/Medium/Low match only a saved assessment for that user's currently accessible PR head. Unassessed includes missing, malformed or old-commit assessments; it never means low risk. A saved-risk filter still requires current AI consent and the AI summaries/risk setting. It does not generate a new assessment, consume an AI action or reveal another user's cached results. Review a PR explicitly to obtain an assessment when needed.

Recent title searches are bounded to five terms in session memory for the active account. They are never written to localStorage, sessionStorage or native SecureStore. Reload, sign-out or account change clears them. Clear recent searches is also available. The old shared recent-search key is never read, and is removed from browser/native storage on identity changes when storage deletion is available; deletion failure does not enable reading it or persisting new queries. Async callbacks carry the original account and cannot save a late former-account term into the new account's history. Private query/filter state is not placed in the screen URL or browser navigation history.

## Paging and resource bounds

`GET /v1/search/prs` accepts the typed filters and an opaque cursor. The API always uses the signed-in user's own GitHub token. The cursor carries a bounded page and account/filter scope hash; it is not an authentication signature. Reusing a cursor with another account or filters is rejected. Authentication and repository authorization do not depend on cursor secrecy.

One request examines at most 20 upstream candidates. With All risk it makes one logical GitHub search read. A risk filter adds at most 20 current-head/access reads, with at most four in flight. The existing GitHub helper permits one retry per logical read, so the maximum is 42 network attempts, not 21 attempts. A shared 20-second signal bounds upstream work; incoming cancellation is forwarded too. The helper's retry backoff/error handling may finish just after that deadline. No unbounded scan fills a sparse risk-filtered page.

An empty filtered page with a next cursor offers Load more. It is not called an exhausted search. The UI reports how many candidates have been checked and exposes GitHub's incomplete-results flag and 1,000-candidate search cap. Narrow filters when either applies. GitHub search is a live result set, not a snapshot: updates and timestamp ties can move rows between upstream pages. The server deduplicates and sorts each returned page deterministically; the client keeps newer duplicate revisions and stable first-seen page order so later pages do not move the reading position. Refresh restarts the query.

Input changes immediately hide mismatched rows, cancel stale transport and debounce the next request by 300ms. Only one append is allowed at a time; failed pages can be retried without advancing the cursor. The screen keeps query, filters, loaded pages and scroll position while visiting a PR and returning. Account changes remount the workspace. Results use a bounded FlatList render window. Filters have a separate bounded scroll area on shorter screens; risk radios support arrow/Home/End keys and expose their checked state.

## Verification (2026-10-29)

- Clean development base `6c13ab19e5eb037fb53c9199afd94d3f6870b004`: `npm ci --ignore-scripts` and `npm run check`, exit 0; 842 baseline tests.
- Final `npm run check`: exit 0; 857 tests (API 520, mobile 292, web 23, contracts 22), typecheck and lint clean. No tests skipped, removed or security gates disabled.
- Nine API behavior tests cover actual query qualifiers, UTC boundaries/invalid input, later-page risk matches, stale/malformed/cross-user cached risk, current access, consent/settings, cancellation forwarding, cursor scope, duplicate/tie order, incomplete/capped results and bounded calls. Four client tests and two added storage tests cover complete transport filters, cancellation, stable/newest dedup, private recents/late writes/limits/legacy cleanup.
- `node apps/mobile/scripts/check-search.mjs`: exit 0; twelve scenarios at 393×852 and 1440×1100. Exercises loading, keyboard filters, invalid-date recovery, actual multi-page low-risk matching after an empty page, recent privacy, stale query, pending-query account switch, long-list PR/Back with filters retained, bounded rendered rows, error/retry/offline/denied/empty/incomplete/cap, filter height and no overlap/overflow. External GitHub/API transports are mocked; the screen is the real exported app.
- Existing session lifecycle, navigation focus, readout and feature-flag browser scripts pass. The navigation fixture now supports the new search response; its original assertions remain. Navigation also checks 320px/enlarged heading layouts. An earlier session fixture timed out during concurrent runs; an unchanged isolated rerun passed. No assertion was weakened.
- Web export, default iOS/Android JavaScript exports and API dev Wrangler packaging dry-run: exit 0. No new native module, permission, dependency, migration or configuration requirement. JavaScript exports are not physical-device/native-build acceptance.
- `npm run security:bundles`: exit 0; API production packaging and web/iOS/Android source-map exports pass, audited affected dependency instances absent from inspected bundles. npm audit itself still exits 1 with 3 high/5 low tooling findings. No zero-vulnerability claim.
- Redacted Gitleaks changed-commit scan: zero findings. Whole-source scan: two unchanged published RFC Web Push vectors in `apps/api/test/web-push.test.ts`; its nonzero result remains recorded. `git diff --check`: exit 0.

Logs: `/private/tmp/j014-*`. Screenshots: `/private/tmp/mergemate-search/{loading-main,filtered-empty,long-list,main,error,offline,denied,empty,incomplete}-393.png` and corresponding 1440 files. Loading screenshots are also saved for each scenario. These are local fixture evidence, not deployed/private-user data.

## Reproduce and smoke

```sh
npm ci --ignore-scripts
npm run check
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=/__api npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-search.mjs
```

The fixture command starts the actual exported app at a random `http://127.0.0.1:<port>/search`, blocks external traffic, drives the flows above and closes the server. Chrome must be installed. After independent review, merge and an approved dev release, owner smoke is: sign in; filter by a real repository/author/UTC day; check a later page; explicitly review a PR to save risk; return and use that risk filter; open a later search row and return; switch accounts and confirm old query/results/recents are absent. Expected behavior follows the filter and paging rules above.

## Integration and release gates

One PR targets development. No unmerged account deletion, voice notes, Highlight or Inbox PR commits are included. Preserve their session/storage/client/UI changes during reconciliation, especially J-012's new Inbox protocol and scoped cache invalidation. Independent exact-head review must record PASS; the owner merges. This implementation receipt is not self-approval.

No merge, deployment, remote migration, cloud/flag/secret mutation, live GitHub/provider write, main push or store build/upload was performed. No new migration is needed. Authenticated dev smoke, physical keyboard/screen-reader/device testing and production acceptance remain separate operator gates.
