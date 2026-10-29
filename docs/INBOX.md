# Inbox operations (J-012)

The Inbox loads accessible GitHub pull requests into All, Needs review, Mentions and Mine. The selected filter is saved per signed-in account. Done hides the observed revision; later activity is visible. Snooze lasts 24 hours using server time. Undo is available after acknowledgement and can be recovered after reload. Demo actions remain disabled. No row requests AI analysis.

## State and compatibility

Migration `0015_inbox_operations.sql` adds the operation token and account preference/last-Undo pointer. It is source-only in this PR. Migrations 0013/0014 belong to separate account deletion/voice-note PRs; preserve them when integrating and apply pending migrations in order with the normal approved release runner before serving the new API. Do not deploy this client against the previous API.

`POST /v1/notifications/:id/state` accepts a UUID operation ID, expected predecessor token, action and observed PR revision. Initial state uses a null predecessor. Successful conditional writes retain the latest Done watermark; retries with the same current operation return its original receipt. Undo writes a new restore token rather than deleting the state, so an old Done cannot replay after Undo. A stale device receives `409 state_conflict` and refreshes instead of overwriting another device. Concurrent operations with one predecessor admit one winner. A client retries an uncertain write with its original UUID.

Database triggers atomically move the last-Undo pointer with the successful state change, including two items changed at the same timestamp. Replays do not move the pointer. A latest Restore yields no recovered Undo, rather than reviving an earlier item's action. Last-Undo recovery revalidates current GitHub repository access and returns only the owned item ID/receipt. It stores no title, code, token or PR body.

The legacy Done/Snooze/Restore endpoints remain for existing clients. They refuse to overwrite operation-managed rows; an older client may need to update and refresh. This compatibility behavior is deliberate. Restore tombstones persist with existing notification state and cascade on account deletion. It is not an unbounded operation log.

All new endpoints use existing session, CSRF, rate and response protections. Mutations verify current GitHub access with the user's own token. Preferences and state are always keyed to the authenticated user; the caller cannot choose a user ID. GitHub access checks read PR metadata, never write to GitHub.

## Paging and screen behavior

Fresh GitHub searches run for each requested page; the Inbox does not serve cached private GitHub search results from the API. Duplicate rows keep the newest revision and priority kind. Equal timestamps sort by opaque ID. New cursors include the account/filter/limit/search scope and a bounded page number. Scope hashes detect accidental cross-view reuse; they are not authentication signatures. Legacy numeric cursors remain supported and still execute with the current user's token.

GitHub search remains a live, changing result set with the existing 1,000-result limit per query. Paging is not a historical snapshot: upstream updates can move items between pages. Client deduplication prevents duplicate rows and older revisions replacing newer ones. An empty filtered page with a cursor offers Load more rather than declaring Inbox Zero.

The client allows one append at a time, supersedes old loads on filter/account changes, and revalidates previously loaded pages before replacing the list. Failed revalidation retains the displayed list. Done/Snooze project an optimistic removal; failed writes roll it back. Undo failures retain the retry action. New revisions remain visible despite an older optimistic removal. Account changes unmount the previous workspace and reject its late callbacks.

Foreground/focus refresh and snooze wake timers refresh Inbox data only. They must not cancel pending public feature-flag checks (including read-aloud). Back from PR detail restores the virtual list window and offset. Filters expose their selected state and support Left/Right/Home/End keyboard navigation on web; the active filter is the tab stop. A visible Refresh action complements native pull-to-refresh.

## Verification (2026-10-29)

- `npm ci --ignore-scripts`: exit 0. Clean development baseline: 842 tests on repeat. The first untouched baseline attempt encountered the existing local Durable Object `ECONNRESET`; no test was skipped or weakened.
- `npm run check`: exit 0; 860 tests (API 523, mobile 292, web 23, contracts 22), typecheck and lint clean.
- Targeted notification/operation API checks: 22 tests; Inbox client checks: 6 tests. Includes CAS races, replay after Undo, same-time last-Undo ordering, current access, CSRF, account isolation/cascade, snooze boundary, cursor scope, duplicate revision/tie ordering, rapid write deduplication and pending flag refresh preservation.
- Web export and `node apps/mobile/scripts/check-inbox.mjs`: exit 0; ten scenarios at 393/1440 pixels. Tests all filters/keyboard, saved filter after reload, optimistic write failure and repeated taps, Undo failure/retry/reload, snooze expiry/reload, empty/exhausted and cursor-empty states, long-list PR/Back, account switch with a pending write, disabled demo and no eager AI.
- Existing `check-readout.mjs`, `check-session-lifecycle.mjs`, `check-navigation-focus.mjs` and `check-feature-flags.mjs`: exit 0 after adding the new preference/Undo protocol to their API fixtures; original assertions retained. Heading/focus suite also runs at 320 pixels. Speech/API/GitHub transports are mocked.
- iOS/Android JavaScript exports and API dev Wrangler packaging dry-run: exit 0. `npm run security:bundles`: exit 0, all audited affected dependency instances absent from inspected API/web/iOS/Android bundles. Tooling audit remains open (3 high, 5 low); this is not a zero-vulnerability claim. No dependency changes.
- Redacted Gitleaks changed-commit scan: zero findings. Whole-source scan: two unchanged published RFC Web Push fixture vectors in `apps/api/test/web-push.test.ts`; scanner exit 1 remains recorded. `git diff --check`: exit 0.

Fixture screenshots: `/private/tmp/mergemate-inbox/{main,empty,initial-error,cursor-empty,demo,done,long-list}-393.png` and matching 1440 files. API and regression log files use `/private/tmp/j012-*`. These are local fixtures, not evidence of deployed behavior.

## Reproduce the screen checks

```sh
npm ci --ignore-scripts
npm run check
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-inbox.mjs
```

The script starts the actual exported application on a random `http://127.0.0.1:<port>/inbox` fixture server, blocks external traffic, and closes it afterward. It exercises the actions above and writes screenshots. Chrome must be installed. To inspect the ordinary app after the reviewed API and migration have been released: sign in, change filter and reload, Done then reload and Undo, Snooze and check another device, open a later loaded PR and return, and switch accounts. Expected results match the state and paging rules above.

## Remaining gates

Independent review must record PASS with the exact PR head before the owner merges. No self-approval, merge, deployment, remote migration, flag activation, live GitHub/model/provider call or production change was performed. New native modules/permissions were not added; JavaScript exports are not native builds. Authenticated dev smoke, physical-device/screen-reader testing and production acceptance remain separate operator gates. Preserve unmerged account deletion, voice-note and Highlight features while reconciling their PRs.
