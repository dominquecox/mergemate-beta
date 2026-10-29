# Read-only PR workspace (J-015)

The PR workspace opens from current GitHub metadata without waiting for AI. Files, checks and discussions load independently. Existing AI summary/risk behavior remains available after consent; paging and merge-status refresh do not request additional analysis. The app adds no GitHub merge, approve, comment, close or check-rerun action.

## Data, access and paging

The workspace metadata request opts into `lazy=1&workspace=1`, fetching only the pull request. The default metadata/full-detail interfaces retain their previous behavior for triage and existing consumers. Checks load separately, so a check-service failure cannot prevent opening the PR or reviewing its files.

Version 2 of the existing section-page API supports Files, Checks and Comments. Every page first reads the PR using the signed-in user's own GitHub token, revalidating both access and the current head. New opaque cursors contain a bounded page, source, head and user/PR/section scope hash. The hash is not a security credential; authorization always uses the current user's token. The client also sends its expected head on the first page. A changed commit returns `409 pr_changed`; the old page is not appended. Refreshing the workspace clears old-revision files/discussions and starts the new revision. Same-head refresh preserves file/discussion disclosure and wrapping choices, while restarting current checks. Legacy numeric/comment cursors remain supported for older clients; version 2 is explicitly requested by the new client.

Each request reads at most 25 files or comments/reviews; a check page reads up to 25 check runs plus 25 commit-status contexts. Files/comments require one PR-access read plus one page read; checks require one PR read plus two parallel source reads. Existing GitHub transport allows one retry per read. A shared 20-second signal applies to workspace upstream reads and forwards incoming cancellation; transport backoff may finish just after that deadline. Each upstream response is capped at 4 MiB of bytes actually read, including absent/misleading Content-Length, before JSON parsing. Oversized responses fail closed with a normal upstream error.

Pagination is bounded to 120 pages per source: 3,000 files, 3,000 check runs/status contexts each, and 3,000 records from each discussion source. Reaching a full final page sets an explicit cap warning. GitHub itself limits the file listing to 3,000 files ([GitHub file-list documentation](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files)); the app offers Open in GitHub for remaining/full context. Pagination is a live read, not a historical snapshot. Head changes are rejected; concurrent same-commit comment/check updates can still occur. Stable IDs and row merging prevent duplicates, and each section permits only one append at a time.

## Files and diffs

File status retains renamed, copied, deleted/removed and unknown states. Renames retain the previous path. Missing patches are described honestly: binary, empty or oversized files can lack a patch; absence is not guessed to mean a specific binary type.

Workspace file-page patches are bounded to 65,536 UTF-16 code units each. A clipped patch or one whose changed-line counts do not cover the file's additions/deletions is marked partial and visibly labelled. The client no longer silently cuts patches to 2,000 characters. Full legacy/AI input remains unchanged, avoiding a new blind spot in existing secret scanning or model context; an end-to-end test proves that a marker beyond the workspace cap remains in that input.

Diff rows keep the line number and +/- marker separate from wrapped text. File headers, EOF/no-newline markers and CRLF handling do not create phantom code line numbers. Wrapping defaults on and persists per file across disclosure changes and page loads. The existing AccessibleSwitch supplies web keyboard and native controls with at least a 44px target. Untrusted file names cannot read inherited object properties as wrapping preferences.

The diff initially renders 400 rows. Show more adds 400 at a time up to 2,000 rendered rows, with an explicit notice and GitHub fallback for the rest. Long unbroken code wraps within the phone screen; disabling wrapping confines horizontal scrolling to the diff. Files remain closed until selected. Expanded paths, wrapping and discussion disclosure survive later page loads and same-head refresh. A changed head discards old diff/discussion data.

## Checks, discussions and navigation

Check runs and commit-status contexts page together. Stable check IDs prevent collisions between similarly named runs and across pages. Queued/in-progress, failure, cancelled, skipped, neutral and successful results remain distinguishable; only success counts in the successful-check total. The displayed count is explicitly the loaded count. Missing/unknown mergeability remains “Checking merge status”; at most three automatic rechecks occur. Refresh updates the actual PR status, including merged/closed transitions. GitHub's mergeability chip is not an app review approval and adds no write control.

Inline review replies retain root, path, line and outdated context across pages. Issue conversation comments and submitted review bodies are separate groups and ID namespaces. Unsubmitted pending reviews are excluded because they are not published and lack a submission date ([GitHub review documentation](https://docs.github.com/en/rest/pulls/reviews)). REST review comments do not provide authoritative resolved/unresolved thread state; the app labels them review discussions and makes no resolution claim. Comment bodies render as selectable plain text, including literal HTML, rather than executable markup.

PR/share/check links are validated as HTTPS GitHub links without embedded credentials. Unsafe links are disabled or omitted. Non-GitHub check-provider destinations are not opened under the GitHub-only link policy. Failed linking/sharing gives a recoverable message. A PR opened directly falls back to Inbox when there is no app back-stack; ordinary Back uses the existing stack. Header's optional Back callback leaves other screens' behavior unchanged.

A workspace is keyed to both account and PR. On unmount it cancels owned metadata, page and AI requests. Late responses and old-head results cannot replace the next workspace. Local draft/disclosure state cannot leak to another PR/account. Existing private-note UI is retained; durable voice-note work remains in the separate unmerged J-006 PR and must be preserved during integration.

## Verification (2026-10-29)

- Clean development base `6c13ab19e5eb037fb53c9199afd94d3f6870b004`: `npm ci --ignore-scripts` and `npm run check` exit 0; baseline 842 tests.
- Final `npm run check`: exit 0; 859 tests (API 521, mobile 293, web 23, contracts 22), typecheck and lint clean. Ten new API and seven new client/data tests cover authorization/revision/cursor scope, independent paging, check states, cross-page threads/conversation/reviews, body caps/cancellation, missing/partial/renamed/deleted patches, line semantics, full AI-input preservation and deduplication. Existing assertions were adapted only for intentional stable IDs, accurate renamed status and controlled diff props; no tests were skipped/deleted.
- `node apps/mobile/scripts/check-workspace.mjs`: exit 0; sixteen actual exported-app scenarios at 393×852 and 1440×1100. Covers loading, errors/retry, access denial/loss, empty independent sections, rapid taps, multi-page files/checks/discussions, missing/renamed/deleted/partial/long patches, bounded line rendering, keyboard wrap/disclosure, preserved preferences, safe links/plain HTML text, changed-head refresh, exactly three unknown-state rechecks, deep-link Back and pending file/AI cancellation when opening another PR.
- Existing navigation, session lifecycle, readout and feature-flag browser suites pass. The readout fixture now answers the new check-page request; its original speech/cancellation/privacy assertions remain. Browser GitHub/API/AI/speech transports and external link opening are mocked; production paths are real app code.
- Web export, default iOS/Android JavaScript exports and API dev Wrangler packaging dry-run pass. No native module, permission, dependency, migration or environment-setting change. JS exports are not native builds or physical-device acceptance.
- `npm run security:bundles`: exit 0; API production packaging and web/iOS/Android source-map exports pass. Audited affected dependency instances are absent from inspected bundles. npm audit still exits 1 with 3 high/5 low tooling findings; this is not a zero-vulnerability claim.
- Redacted Gitleaks changed-commit scan: zero findings. Whole-source scan: two unchanged published RFC Web Push vectors in `apps/api/test/web-push.test.ts`; its nonzero result remains recorded. `git diff --check`: exit 0.

Logs: `/private/tmp/j015-*`. Fixture screenshots: `/private/tmp/mergemate-workspace/{loading-main,wrapped,main,error,denied,empty,route,unknown,loss,unsafe}-393.png` and matching 1440 files. Loading screenshots are saved for every scenario. These contain fixture data, not live private repositories.

## Reproduce and release gates

```sh
npm ci --ignore-scripts
npm run check
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=https://api-dev.mergemate.dev npm run export:web -w @mergemate/mobile
node apps/mobile/scripts/check-workspace.mjs
```

The browser command starts the exported app at a random `http://127.0.0.1:<port>/pr/acme/api/7`, blocks external traffic, drives all states and closes the server. Chrome must be installed. After independent review, merge and an approved dev release, owner smoke is: open a real large PR; page files/checks/discussions; inspect a rename and a missing/partial patch; toggle wrapping with keyboard; refresh merge status; visit a different PR while a page is loading; return and check the correct content. Test at phone and desktop sizes. The migrated API is not required here, but the new API must be released before this client because it introduces check paging and workspace metadata mode.

One development PR; independent exact-head PASS required, then the owner merges. No self-approval, merge, deployment, remote migration, cloud/secret/flag/provider mutation, main push or store build/upload was performed. Preserve unmerged PRs 125–129 when reconciling, especially private notes, readout/session guards, Inbox protocol and search. Authenticated dev, real provider permissions, physical-device/assistive-technology and production acceptance remain separate operator gates.
