# Built during the hackathon

**Submitted as MergeMate beta, a web app (desktop browser).** This beta ships web only. Notes below about iPhone or Android builds describe earlier work in the history, not the submitted beta.

MergeMate was built entirely during the Meta Global AI Developer Hackathon, as confirmed by its founder. Application implementation commits begin October 26, 2026. The earlier October 14 initialization contained only `.gitattributes`.

This repository carries the full development history at its real dates. Short SHAs below are commits in this repository; PR numbers refer to pull requests in the private development repository, which are not published. The October 27–30 table is a partial historical ledger, not a claim that development started October 27. Later implementation is summarized separately. See [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).

All new application source is included. Existing dependencies and third-party assets retain their licenses. Source implementation, local fixtures, live inference and physical-device acceptance are distinct evidence; sample viewing makes no live model calls. MergeMate never merges: an agent opens a draft pull request only after the owner approves the exact patch with a passkey.

## November 4: boards for AI agents

Source for this refresh adds a board for teams of coding agents, behind the `brain` feature flag (off by default, off in production). Merged pull requests in the private development history:

| PR | What it adds | Evidence limit |
| --- | --- | --- |
| #253, #255 | Board API: projects, ordered cards, project rules, per-project agent tokens (stored as hashes), time-limited locks, handoffs and a track log; the `brain` flag published to the app | Unit and route tests; dev only |
| #252, #257 | Board UI: projects, board, card detail, track timeline; add, edit and reorder cards; project rules editor; "Proceed with the track" | Unit tests; no live device run claimed |
| #258 | Owner "proceed": the signed-in owner locks the top free card on the same rules as an agent | Route tests |
| #250 | `packages/brain-mcp`: a stdio MCP server with seven tools for agents | Unit tests and a real stdio round trip against a local server |
| #259, #260 | Merge verifier: on a merged PR linked to a card, checks the merged head and tree against the validated head, the card's branch, and the gate record in the PR description, then writes PASS or FAIL on the card. Read-only on GitHub, only for owners who can still read the repository; retries a failed read. Also hides board routes while the flag is off, frees locks when a card closes, and caps agent log volume | Unit and queue-consumer tests |
| #251 | Agent runtime library: takes a card, plans through the consent-gated, metered AI path, validates the proposal and writes the handoff | Unit tests |
| #261, #264 | Agent runs that open a draft PR from a card, entirely in the API Worker. It reads the repository through the GitHub App (allowed paths only), picks up to 8 files with a gated model call, writes the patch from their real contents, and checks the path, size and credential rules. The owner approves the exact patch with one passkey tap, used once. Then the API opens a draft PR on a new `mergemate-agent/<run>` branch with a one-repository write token that is revoked right after, and the card is linked. Kill switch, per-user block and daily caps. | Unit and route tests through the real approval and publish code, including replay, hash mismatch and boundary refusals. **No tests are run on the patch in this beta.** Nothing merges on its own |
| #263, #266 | Board card agent panel: Proceed, Plan with agent, Approve the patch, Draft PR link. Fuller kill-switch tests and operator notes. | Unit tests; no live device run claimed |

Every change above was validated by an independent reviewer at its exact head before it was merged. The AI consent text and privacy page were also updated to say that, without your own Meta key, requests run on free Meta credits that Meta may use for product improvement (#256).

## November 2 implementation/evidence update

Source at development `e46ef50` includes the following additional merged work. Merge/build receipts establish delivery of code; real GitHub, model and device behavior must be demonstrated separately before being claimed in the submission.

| PR | Landed SHA | Implemented behavior / evidence limit |
| --- | --- | --- |
| #190 | `abc6c7f` | Pitch and 44pt review controls; local UI tests. |
| #191 | `9266e3f` | Labeled sample visual gallery; no live inference implied. |
| #192 | `8d9a867` | Swipe interactions, revision-bound image inspection and confirmed read-only GitHub handoff. |
| #193 | `176d824` | Agent heuristics, device digest, execution inspector, copied target fixes and triage brief export; fixture validation. |
| #194 | `1baf4e9` | Push/activity/quiet-hours/offline/preflight source; live/native acceptance is separate. |
| #195 | `de37a33` | Compact PR header/actions and local release preparation. |
| #200–201 | `27919ba` | Native browser return and web callback recovery; owner device smoke still required. |
| #202 | `e46ef50` | Android offline-first/system-speech fallback, keyboard-aware notes, compact Inbox and consistent listening icons. |

The current source has 469 passing mobile tests at the last mobile-polish verification. Tests and browser fixtures do not certify physical device behavior. Sign-in and all five mobile-polish checks remain awaiting owner device evidence. Android system speech can use network services under device engine settings.

The recording path is a consented, signed-in PR: Inbox, PR detail, summary with its actual serving-model label, readout, then save a private note. The sample PR7/412/9 walkthrough remains a clearly labeled alternative; samples cannot validate private notes, real OAuth or live inference. Do not present those alternatives as interchangeable proof.

## Execution-backed QA implementation — November 2

PR #204 adds current-head GitHub check-run provenance (provider/timing/source), a QA evidence inspector, and a private operator-run browser QA command. Reports are tied to an actual open private PR/head and include bounded step results and screenshot hashes. Stale/missing execution heads are not counted as current runs. Local reports are user-supplied, kept in screen memory, labeled browser-fixture scope and cannot upgrade the executive verdict or remove security findings. Desktop commands can be copied for the trusted repository.

The operator explicitly invokes the runner in a clean reviewed checkout; it does not execute arbitrary PR code from the API, enable workflows, generate tests autonomously or certify live/native behavior. Source implementation and local verification do not establish deployment. See docs/QA_EVIDENCE.md for exact reproduction and limits.

## Submission packaging (November 1, 2026)

**Value proposition:** MergeMate is the PR gatekeeper for tech leads shipping with AI agents. Where GitHub Mobile provides mobile GitHub access and Copilot helps explain code, this demo centers the decision a lead needs before opening a laptop: “Can I safely ship this right now?” A verdict directs attention; it never approves, merges, or certifies a change as safe.

The three differentiators are the **5-Second Executive Verdict**, **Visual UI Inspection with Meta SAM-3.1 and vision**, and the **60-Second Swipe Triage Deck** with desktop keys **1 / 2 / 3 / Z**. The time labels are workflow goals, not measured benchmarks. Agent provenance adds context to the decision, using available author/branch metadata rather than verified attribution.

Verified additions to the historical log:

| PR | Landed SHA | Delivered behavior |
| --- | --- | --- |
| #188 | `db992f6` | Deterministic verdict hero, agent provenance badge and canned visual audit example. |
| #189 | `db8d0e5` | Card-level verdict and provenance, desktop triage shortcuts, completion screen and sample PR 9. |

### Three-minute submission script

Rehearse to the time cues below, leaving the final seconds of each segment for the demonstrated action. Target audience: startup-track judges; deadline November 4, 2026, 9 PM Eastern. The spoken script is finalized for this pack; a recording and submission are separate steps.

| Time | Screen / action | Spoken narration |
| --- | --- | --- |
| 0:00–0:25 | Open the sample inbox on an iPhone-sized viewport. | “AI agents can open pull requests faster than a tech lead can review them. Your phone lights up with another change, but the answer is buried in 800 lines of code. Copilot can explain a diff. GitHub Mobile brings the repository to your phone. MergeMate focuses on your next decision: can I safely ship this right now without opening my laptop?” |
| 0:25–0:55 | Open sample PR 7, low-risk Worker scaffold. Show the Executive Verdict and agent provenance. | “This is MergeMate, our PR gatekeeper for teams building with AI agents. Start with this low-risk scaffold change. The executive verdict gives a low-risk signal with its reasons. The agent badge shows likely provenance, so I know where the change came from. In a real signed-in request, configured Meta AI helps explain the PR; this screen uses a labeled sample. Deterministic rules combine risk, sensitive paths, reported check failures and secret warnings into the verdict. The human still decides.” |
| 0:55–1:25 | Open sample PR 412. Show the red verdict and jump to the sensitive file. | “Now compare this authentication and database change. A reassuring summary is not enough when a mistake could affect sessions or payments. MergeMate puts the high-risk verdict first and takes me to the sensitive file. I can move this review to my desktop instead of guessing on my phone. The product stays read-only: no merge, approval or comment is sent to GitHub.” |
| 1:25–2:00 | Open sample PR 9 and its Visual UI Audit entry. Show the labeled Highlight screenshot sample. | “Code is only half the story when the change is visual. This mobile UI pull request points me to Highlight. In the configured live path, Meta SAM-3.1 locates screenshot regions before vision analysis explains what needs attention. We want to catch problems like touch targets below 44 points and clipped layouts. This labeled example is canned demo data, not a live model response. A screenshot finding guides inspection; it does not prove the actual touch area.” |
| 2:00–2:35 | Open Triage Deck. Use 1, 2, 3 and Z; show the completion screen after the final choice. | “Finally, I can sort the backlog in a short triage session. Ignore the low-priority item, keep another for later, and mark the risky change as needing me. On desktop, one, two and three make those choices; Z undoes the last one. The verdict stays visible on each card. These choices organize my MergeMate queue and never change a pull request on GitHub.” |
| 2:35–3:00 | Finish on the verdict or completed deck, with MergeMate branding. | “We built MergeMate for the lead who is accountable for an increasing stream of agent-written code. Understand risk in five seconds, inspect the UI, and organize the queue in sixty. This walkthrough used sample data with no model calls. Live AI requires consent and configured access. MergeMate brings the review decision into your pocket while keeping the shipping decision in your hands.” |

### Demo and model disclosures

- Golden path: **PR 7 → PR 412 → PR 9 → Triage Deck**. PR 7 is a Worker scaffold in the checked-in fixture, not a docs-only change; the narration follows the actual sample. Enter sample/demo mode explicitly. Samples and Highlight results are prerecorded data in code: no uploads or model requests happen in demo mode.
- Live Highlight is separate: it requires user consent, the enabled Highlight flag, provider access and an uploaded image. When configured, SAM-3.1 segments regions and the configured vision route explains them. Provider fallback can change the serving model; show the returned model label rather than attributing every result to a fixed model. The canned screenshot's model wording is not evidence of a live call.
- Recording cue: enter sample mode, open PR 9, then its visual audit entry and the “Mobile settings regression (Meta SAM Audit)” sample. The prerecorded gallery is available in demo mode even when live Highlight is disabled. Its results remain labeled as samples; they do not upload images or call a model. Outside demo mode, the live feature flag and AI consent still gate uploads. Do not describe a sample as a live model response.
- A screenshot alone cannot certify a 44pt touch target, clipping behavior, accessibility conformance or safe code. Verify source sizing and the rendered interaction. “Safe to Ship” is a prioritization label, including when evidence is incomplete, not a substitute for review and tests.
- Touch-target scope for this pack: both ExecutiveVerdictCard actions and every direct triage button have explicit minimum dimensions of at least 44pt. Decorative badges and icons are not controls. Existing mobile layout tests enforce vector icons instead of emoji in app/ and src/.
- No new model integration, GitHub write permission, cloud flag, deployment, store build or submission is performed by this packaging change.

## Muse-authored change

Reserved for the small feature change written with Meta Muse as a coding assistant (demo part C). It is **not listed as Muse-authored until its pull request is merged and appears in `git log`**.

| Date | PR | SHA | What | Status |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | Not yet run. Branch `feat/MM-065-muse-<slug>` to be created when the change is picked. |

## Highlights by theme

Grouped from the log below. PR numbers point to the rows.

**Meta AI in the app**
- Clef decision path, `muse-spark-1.3` and `sam-3.1` added to the model allowlist, and an `AI_PROFILE` switch (hackathon or prod): #140.
- Clef-flash feeds the quality classifier score that was previously empty: #141.
- Highlight supports opt-in SAM 3.1 region detection before configured vision analysis (live execution must be verified): #142.
- Earlier in the window: AI call failures logged by status or reason only (#50), Meta key check fixed for Workers (#95, #97), rejected model keys read as setup errors with bounded upstream calls (#117), summaries for large PRs analyze their files with one charge per summary (#116), precise secret warnings and risk never hidden by an AI outage (#115), the Highlight feature flag enforced default-off (#111).

**Inbox, search and PR workspace** (integration #133)
- Inbox with conditional undo, snooze wake-up, persisted filters and keyboard navigation (J-012).
- Search with saved-risk filters, private recents and paged results (J-014).
- PR workspace with revision-scoped files, checks and discussion, loaded independently (J-015).

**Highlight, voice notes and consent** (integration #133)
- Highlight for screenshots with private, no-storage processing (J-007).
- Private notes with bounded voice capture and transcript review (J-006).
- AI consent store with truthful consent screen and revocation (J-020).
- Account deletion with durable leases and local data erasure (J-005).

**Reviewer co-pilot (read-only, Meta-driven)**
- Review plan: reading order with a reason per file, a verify-before-approving checklist, and a draft comment you copy (never posted): #156 (MM-073).
- Ask this PR: answers grounded in the PR, with citations limited to its real files: #156 (MM-074).
- Model labels on AI results and the original Settings engine card: #156 (MM-075). The internal engine card was subsequently removed from user Settings in #187 (`fa03b55`).
- One control per job across the web app, with no duplicate actions: #155, #158 (MM-076).

**Demo-path UI polish**
- Onboarding fit, flat AI summary and AI loading skeleton: #143.
- Compact Inbox readout bar, single refresh, no white flash before dark theme: #139.
- Roomier PR header card, lighter buttons, clearer empty repos state: #138.
- Native-safe conditional rendering, including the Inbox crash fix: #136, #137.

**Platform and reliability**
- Installable web app, offline page and browser notifications: #114. Android parity and App Links: #54. Apple universal links identity: #123.
- Billing: honest trial and server-confirmed success: #122.
- Sign-in hardening: #53, #108, #121 (J-003).
- Webhook intake bounds and queued-delivery recovery: #105. Shared rate admission: #55, #113. Telemetry user id hashed with a per-environment salt: #51.
- Internal structure: AI engine split into focused modules (#134) and the mobile API client split into transport, session and data layers (#135).

**Accessibility**
- Checked state on plan and theme radios (#98, #107), 44px hit target on the repo watch switch (#102), triage progress label (#104), heading focus across navigation (#119), 320px demo banner fix (#103).

## Full log

Chronological, oldest first. The Muse-authored row above is the only one not drawn from this list.

| Date | PR | SHA | What |
| --- | --- | --- | --- |
| 2026-10-27 | #50 | `1e87d8b` | Log why an AI call failed (status or reason only, no content) |
| 2026-10-27 | #53 | `ee6c9d9` | Sign-in: report GitHub's 429 as rate_limited with a wait |
| 2026-10-27 | #52 | `5912b9a` | Improve list loading and request control |
| 2026-10-27 | #51 | `701a814` | Hash telemetry user id with per-env salt |
| 2026-10-27 | #54 | `c33fbe4` | feat(mobile,web): MM-053 Android app parity, App Links assetlinks.json, and EAS profiles |
| 2026-10-27 | #56 | `c87a4e2` | Record content-free voice usage metrics |
| 2026-10-27 | #55 | `3aea722` | MM-055: rate-limit every public path before its handler |
| 2026-10-27 | #92 | `1b24811` | fix(api): configure production resource identities |
| 2026-10-27 | #94 | `b4346af` | Regenerate app icons from master art |
| 2026-10-27 | #93 | `51a17bf` | fix(api): follow renamed development GitHub App |
| 2026-10-27 | #95 | `e24f2cf` | fix(api): use a redirect mode Workers accept for model calls |
| 2026-10-28 | #97 | `3d7bd87` | fix(api): log why the bot check failed; Workers-safe redirect for Meta key check |
| 2026-10-28 | #98 | `1ed6f8e` | fix(billing): add checked state to plan radio buttons for WCAG compliance |
| 2026-10-28 | #99 | `7cb0ad6` | feat(web): block sensitive leak probes with 404 and support PWA worker scope (J-037) |
| 2026-10-28 | #100 | `230b503` | fix(support): add client-side email format validation before submission (J-029) |
| 2026-10-28 | #101 | `ac027d8` | fix(content): unescape escaped newlines when mapping public posts (J-030) |
| 2026-10-28 | #102 | `4dbd39b` | fix(repos): wrap watch switch in 44px min hit target area (J-018) |
| 2026-10-28 | #103 | `b163d89` | fix(demo): wrap demo banner contents to prevent 320px overflow (J-019) |
| 2026-10-28 | #104 | `ef4fcd4` | fix(triage): add accessibilityLabel to triage progressbar (J-013) |
| 2026-10-28 | #107 | `3c5c4ac` | fix(mobile): expose checked state on plan and theme radios to web screen readers |
| 2026-10-28 | #109 | `893c9d8` | fix(mobile): load PR files and comments independently |
| 2026-10-28 | #110 | `f610851` | fix(web): allow the Cloudflare Web Analytics beacon in the app CSP |
| 2026-10-28 | #105 | `2d2b24d` | fix(api): bound webhook intake and recover queued deliveries |
| 2026-10-28 | #106 | `43c92dd` | security: verify dependency reachability in release artifacts |
| 2026-10-28 | #112 | `05d2abb` | feat(content): read full published posts with safe public pagination |
| 2026-10-28 | #108 | `e1b022b` | fix(auth): accept verified HTTPS native callbacks only |
| 2026-10-28 | #113 | `64fc5ee` | fix(api): enforce shared SQLite rate admission |
| 2026-10-28 | #114 | `3359d68` | feat(web): installable app, offline page and browser notifications (J-023) |
| 2026-10-28 | #115 | `feb7f94` | fix(risk): precise secret warnings; risk never hidden by an AI outage (J-017) |
| 2026-10-28 | #116 | `8ff3ab8` | fix(summary): large PRs analyze their files; one charge per summary; retry in place (J-016) |
| 2026-10-28 | #117 | `ae94c37` | fix(api): rejected model keys read as setup errors; bounded upstream calls (J-043) |
| 2026-10-28 | #118 | `77af790` | config(api): set the dev Web Push public key |
| 2026-10-28 | #111 | `9207ff9` | fix(api): enforce the default-off highlight feature flag |
| 2026-10-28 | #119 | `6f0bc11` | J-027: Restore heading focus across app navigation |
| 2026-10-28 | #122 | `932092b` | feat(billing): honest trial, portal after Free, server-confirmed success (J-004) |
| 2026-10-28 | #123 | `0000000` | config(web): set the Apple app identity for universal links |
| 2026-10-28 | #124 | `8b1ddf1` | config(api): set the production Web Push public key |
| 2026-10-28 | #120 | `b2079f4` | J-001: Add device-local summary readout |
| 2026-10-28 | #121 | `83ef830` | J-003: Harden sign-in and session lifecycle races |
| 2026-10-29 | #133 | `eddad26` | Integration of account deletion, voice notes, Highlight, Inbox, Search, PR workspace and AI consent (J-005, J-006, J-007, J-012, J-014, J-015, J-020) |
| 2026-10-29 | #134 | `31eed82` | refactor(api): split ai-engine into focused modules |
| 2026-10-29 | #135 | `d1472eb` | refactor(mobile): split HttpApiClient into transport, session, data layers |
| 2026-10-30 | #136 | `7f5b8d9` | fix(mobile): remove bare whitespace string in Inbox list header (native crash) |
| 2026-10-30 | #138 | `3b26758` | fix(web): roomier PR header card, lighter buttons, Add Note focuses the note box, clearer empty repos state |
| 2026-10-30 | #137 | `a375f93` | fix(mobile): native-safe conditional rendering sweep |
| 2026-10-30 | #139 | `64f7f4a` | fix(web): compact Inbox readout bar, single refresh, no white flash before dark theme |
| 2026-10-30 | #140 | `109df91` | feat(api): Clef decision path, muse-spark-1.3 and sam-3.1 allowlist, AI_PROFILE (MM-061) |
| 2026-10-30 | #141 | `b9e8fc4` | feat(api): feed Clef-flash into quality classifierScore (MM-062) |
| 2026-10-30 | #142 | `acee211` | feat(api): Highlight runs SAM 3.1 then Muse Spark behind MODEL_ROUTE_SEGMENT (MM-063) |
| 2026-10-30 | #143 | `60f7e3a` | feat(web): polish demo path: onboarding fit, flat AI summary, AI loading skeleton (MM-064) |
| 2026-10-30 | #144 | `7c75fba` | docs: add NEW_IN_HACKATHON.md from git history since Oct 27 (MM-067) |
| 2026-10-30 | #145 | `5e207df` | chore(MM-068): allowlist public test vectors in gitleaks config |
| 2026-10-30 | #146 | `da9e1bf` | fix(web): load fonts from assets/fonts so scoped @ paths stop redirect-looping |
| 2026-10-30 | #148 | `d93612c` | fix(web): ship /privacy /terms /support as static HTML |
| 2026-10-30 | #150 | `5c616ec` | feat(demo): realistic sample PRs for every inbox item |
| 2026-10-30 | #151 | `2f9b7de` | chore(api): route Clef-flash and SAM 3.1 on dev only |
| 2026-10-30 | #152 | `dd5b240` | fix(web): paint tab and auth scenes with the theme background so dark reload never shows light grey |
| 2026-10-30 | #153 | `85b961c` | Settings: AI summaries is a dependent child of AI processing |
| 2026-10-30 | #154 | `80f1a56` | Highlight: one upload control, results only after analysis, clearer disabled Analyze |
| 2026-10-30 | #155 | `1726ec5` | UI: one control per job (hide Skip on the last onboarding step, single step label, no duplicate desktop actions) (MM-076) |
| 2026-10-30 | #156 | `fa48d56` | feat: review plan, ask this PR and AI engine provenance UI (MM-073, MM-074, MM-075) |
| 2026-10-30 | #157 | `fe16503` | Add MIT LICENSE and point SECURITY.md to private vulnerability reporting |
| 2026-10-30 | #158 | `7fa07c0` | UI: single Highlight title, Mark all read only with unread items, one Triage counter (MM-076) |
| 2026-10-30 | #159 | `06920c7` | test(api): pin SAM output variants; add dev-only live check script |
| 2026-10-30 | #160 | `71d6052` | J-021: Bring-your-own Meta key settings, verification notice and removal tests |
| 2026-10-30 | #163 | `d381ed8` | J-019: Demo network-denial sweep and expired-demo message |
| 2026-10-30 | #161 | `f1d96ef` | Demo AI text matches each sample PR; clear Listen label; NEW_IN_HACKATHON through #159 |
| 2026-10-30 | #164 | `28257e8` | Demo polish: sample-mode Search, per-PR Review plan and Ask, Inbox alignment |
| 2026-10-30 | #165 | `89f550b` | PR workspace: "Why this is risky" banner with jump to riskiest file |
| 2026-10-30 | #166 | `fadb0cb` | Inbox: group by repo with counts, "Needs my review" filter label |
| 2026-10-30 | #167 | `c8fa9dc` | Ask this PR: three starter questions based on the PR's files |
| 2026-10-30 | #168 | `08e7dbe` | Review plan: copy checklist as Markdown |
