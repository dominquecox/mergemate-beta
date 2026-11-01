# New in the hackathon window

What was built for the Meta Global AI Developer Hackathon build window (Oct 27 to Nov 4, 2026). Every row below is a pull request merged into `development` and can be checked with:

```
git log origin/development --first-parent --since='2026-10-27T00:00:00-04:00' --until='2026-11-05T00:00:00-04:00'
```

- Historical full-log snapshot: `development` at `274002c`, 2026-10-30 (ET). 72 first-parent entries (PR merges) from `595473b` (2026-10-27) to `274002c`. The table remains that historical snapshot; the Lane D addendum below verifies #188 and #189 at base `9b21c21` on November 1. Refresh the complete log before submission on November 4.
- Dates are committer dates in ET. SHAs are the commit that landed on `development` (the merge commit for "Merge pull request" entries, the squashed commit otherwise).
- Nothing here is invented: if it is not in the log, it is not listed.
- MergeMate stays read-only by design; none of these changes add a write path to GitHub.

## Lane D submission packaging (November 1, 2026)

**Value proposition:** MergeMate is the PR gatekeeper for tech leads shipping with AI agents. Where GitHub Mobile provides mobile GitHub access and Copilot helps explain code, this demo centers the decision a lead needs before opening a laptop: “Can I safely ship this right now?” A verdict directs attention; it never approves, merges, or certifies a change as safe.

The three differentiators are the **5-Second Executive Verdict**, **Visual UI Inspection with Meta SAM-3.1 and vision**, and the **60-Second Swipe Triage Deck** with desktop keys **1 / 2 / 3 / Z**. The time labels are workflow goals, not measured benchmarks. Agent provenance adds context to the decision, using heuristic metadata detection rather than verified attribution.

Verified additions to the historical log:

| PR | Landed SHA | Delivered behavior |
| --- | --- | --- |
| #188 | `7d987cb` | Deterministic verdict hero, agent provenance badge and canned visual audit example. |
| #189 | `9b21c21` | Card-level verdict and provenance, desktop triage shortcuts, completion screen and sample PR 9. |

### Three-minute submission script

Rehearse to the time cues below, leaving the final seconds of each segment for the demonstrated action. Target audience: startup-track judges; deadline November 4, 2026, 9 PM Eastern. The spoken script is finalized for this pack; a recording and submission are separate steps.

| Time | Screen / action | Spoken narration |
| --- | --- | --- |
| 0:00–0:25 | Open the sample inbox on an iPhone-sized viewport. | “AI agents can open pull requests faster than a tech lead can review them. Your phone lights up with another change, but the answer is buried in 800 lines of code. Copilot can explain a diff. GitHub Mobile brings the repository to your phone. MergeMate focuses on your next decision: can I safely ship this right now without opening my laptop?” |
| 0:25–0:55 | Open sample PR 7, low-risk Worker scaffold. Show the Executive Verdict and agent provenance. | “This is MergeMate, our PR gatekeeper for teams building with AI agents. Start with this low-risk scaffold change. The executive verdict gives a low-risk signal with its reasons. The agent badge shows likely provenance, so I know where the change came from. Meta AI helps explain the PR; deterministic rules combine risk, sensitive paths, reported check failures and secret warnings into the verdict. The human still decides.” |
| 0:55–1:25 | Open sample PR 412. Show the red verdict and jump to the sensitive file. | “Now compare this Auth and Stripe change. A reassuring summary is not enough when a mistake could affect sessions or payments. MergeMate puts the high-risk verdict first and takes me to the sensitive file. I can move this review to my desktop instead of guessing on my phone. The product stays read-only: no merge, approval or comment is sent to GitHub.” |
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
- Highlight now runs SAM 3.1 to find regions first, then Muse Spark explains them: #142.
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
- Model labels on AI results and the original Settings engine card: #156 (MM-075). The internal engine card was subsequently removed from user Settings in #187 (`920b09f`).
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
| 2026-10-27 | #50 | `595473b` | Log why an AI call failed (status or reason only, no content) |
| 2026-10-27 | #53 | `43f902a` | Sign-in: report GitHub's 429 as rate_limited with a wait |
| 2026-10-27 | #52 | `fd344ac` | Improve list loading and request control |
| 2026-10-27 | #51 | `e189c48` | Hash telemetry user id with per-env salt |
| 2026-10-27 | #54 | `b4b24d6` | feat(mobile,web): MM-053 Android app parity, App Links assetlinks.json, and EAS profiles |
| 2026-10-27 | #56 | `3b4bd16` | Record content-free voice usage metrics |
| 2026-10-27 | #55 | `1cd681f` | MM-055: rate-limit every public path before its handler |
| 2026-10-27 | #92 | `3285c61` | fix(api): configure production resource identities |
| 2026-10-27 | #94 | `9cebd3a` | Regenerate app icons from master art |
| 2026-10-27 | #93 | `a080575` | fix(api): follow renamed development GitHub App |
| 2026-10-27 | #95 | `6eebf09` | fix(api): use a redirect mode Workers accept for model calls |
| 2026-10-28 | #97 | `485dc9e` | fix(api): log why the bot check failed; Workers-safe redirect for Meta key check |
| 2026-10-28 | #98 | `46cd0a2` | fix(billing): add checked state to plan radio buttons for WCAG compliance |
| 2026-10-28 | #99 | `354d7a0` | feat(web): block sensitive leak probes with 404 and support PWA worker scope (J-037) |
| 2026-10-28 | #100 | `1bfb8e9` | fix(support): add client-side email format validation before submission (J-029) |
| 2026-10-28 | #101 | `47b7955` | fix(content): unescape escaped newlines when mapping public posts (J-030) |
| 2026-10-28 | #102 | `474e417` | fix(repos): wrap watch switch in 44px min hit target area (J-018) |
| 2026-10-28 | #103 | `390d535` | fix(demo): wrap demo banner contents to prevent 320px overflow (J-019) |
| 2026-10-28 | #104 | `4ef4c46` | fix(triage): add accessibilityLabel to triage progressbar (J-013) |
| 2026-10-28 | #107 | `66669fb` | fix(mobile): expose checked state on plan and theme radios to web screen readers |
| 2026-10-28 | #109 | `24f7cc3` | fix(mobile): load PR files and comments independently |
| 2026-10-28 | #110 | `460ad5d` | fix(web): allow the Cloudflare Web Analytics beacon in the app CSP |
| 2026-10-28 | #105 | `6f2bcd0` | fix(api): bound webhook intake and recover queued deliveries |
| 2026-10-28 | #106 | `c87aeca` | security: verify dependency reachability in release artifacts |
| 2026-10-28 | #112 | `ef2a647` | feat(content): read full published posts with safe public pagination |
| 2026-10-28 | #108 | `6a8e369` | fix(auth): accept verified HTTPS native callbacks only |
| 2026-10-28 | #113 | `dcb9e7a` | fix(api): enforce shared SQLite rate admission |
| 2026-10-28 | #114 | `68cdc78` | feat(web): installable app, offline page and browser notifications (J-023) |
| 2026-10-28 | #115 | `f0f255b` | fix(risk): precise secret warnings; risk never hidden by an AI outage (J-017) |
| 2026-10-28 | #116 | `05333cc` | fix(summary): large PRs analyze their files; one charge per summary; retry in place (J-016) |
| 2026-10-28 | #117 | `e948ebf` | fix(api): rejected model keys read as setup errors; bounded upstream calls (J-043) |
| 2026-10-28 | #118 | `60ecf80` | config(api): set the dev Web Push public key |
| 2026-10-28 | #111 | `29b5563` | fix(api): enforce the default-off highlight feature flag |
| 2026-10-28 | #119 | `2904ab6` | J-027: Restore heading focus across app navigation |
| 2026-10-28 | #122 | `0feac09` | feat(billing): honest trial, portal after Free, server-confirmed success (J-004) |
| 2026-10-28 | #123 | `e78f969` | config(web): set the Apple app identity for universal links |
| 2026-10-28 | #124 | `9efb08b` | config(api): set the production Web Push public key |
| 2026-10-28 | #120 | `34912e7` | J-001: Add device-local summary readout |
| 2026-10-28 | #121 | `6c13ab1` | J-003: Harden sign-in and session lifecycle races |
| 2026-10-29 | #133 | `89f0630` | Integration of account deletion, voice notes, Highlight, Inbox, Search, PR workspace and AI consent (J-005, J-006, J-007, J-012, J-014, J-015, J-020) |
| 2026-10-29 | #134 | `871877e` | refactor(api): split ai-engine into focused modules |
| 2026-10-29 | #135 | `250b9af` | refactor(mobile): split HttpApiClient into transport, session, data layers |
| 2026-10-30 | #136 | `0713f13` | fix(mobile): remove bare whitespace string in Inbox list header (native crash) |
| 2026-10-30 | #138 | `5abd109` | fix(web): roomier PR header card, lighter buttons, Add Note focuses the note box, clearer empty repos state |
| 2026-10-30 | #137 | `e1a6632` | fix(mobile): native-safe conditional rendering sweep |
| 2026-10-30 | #139 | `ac42f34` | fix(web): compact Inbox readout bar, single refresh, no white flash before dark theme |
| 2026-10-30 | #140 | `f87d608` | feat(api): Clef decision path, muse-spark-1.3 and sam-3.1 allowlist, AI_PROFILE (MM-061) |
| 2026-10-30 | #141 | `2c2a975` | feat(api): feed Clef-flash into quality classifierScore (MM-062) |
| 2026-10-30 | #142 | `ddf98ab` | feat(api): Highlight runs SAM 3.1 then Muse Spark behind MODEL_ROUTE_SEGMENT (MM-063) |
| 2026-10-30 | #143 | `1035e5f` | feat(web): polish demo path: onboarding fit, flat AI summary, AI loading skeleton (MM-064) |
| 2026-10-30 | #144 | `c086221` | docs: add NEW_IN_HACKATHON.md from git history since Oct 27 (MM-067) |
| 2026-10-30 | #145 | `9d0ecf7` | chore(MM-068): allowlist public test vectors in gitleaks config |
| 2026-10-30 | #146 | `eb86806` | fix(web): load fonts from assets/fonts so scoped @ paths stop redirect-looping |
| 2026-10-30 | #148 | `9aa7485` | fix(web): ship /privacy /terms /support as static HTML |
| 2026-10-30 | #150 | `de7aa25` | feat(demo): realistic sample PRs for every inbox item |
| 2026-10-30 | #151 | `3f23d3b` | chore(api): route Clef-flash and SAM 3.1 on dev only |
| 2026-10-30 | #152 | `311b101` | fix(web): paint tab and auth scenes with the theme background so dark reload never shows light grey |
| 2026-10-30 | #153 | `69049ad` | Settings: AI summaries is a dependent child of AI processing |
| 2026-10-30 | #154 | `acb7c2e` | Highlight: one upload control, results only after analysis, clearer disabled Analyze |
| 2026-10-30 | #155 | `5a82365` | UI: one control per job (hide Skip on the last onboarding step, single step label, no duplicate desktop actions) (MM-076) |
| 2026-10-30 | #156 | `2485dba` | feat: review plan, ask this PR and AI engine provenance UI (MM-073, MM-074, MM-075) |
| 2026-10-30 | #157 | `4b79604` | Add MIT LICENSE and point SECURITY.md to private vulnerability reporting |
| 2026-10-30 | #158 | `c21736b` | UI: single Highlight title, Mark all read only with unread items, one Triage counter (MM-076) |
| 2026-10-30 | #159 | `6fcf95c` | test(api): pin SAM output variants; add dev-only live check script |
| 2026-10-30 | #160 | `73d84f3` | J-021: Bring-your-own Meta key settings, verification notice and removal tests |
| 2026-10-30 | #163 | `d951c6d` | J-019: Demo network-denial sweep and expired-demo message |
| 2026-10-30 | #161 | `d6b1619` | Demo AI text matches each sample PR; clear Listen label; NEW_IN_HACKATHON through #159 |
| 2026-10-30 | #164 | `52a6357` | Demo polish: sample-mode Search, per-PR Review plan and Ask, Inbox alignment |
| 2026-10-30 | #165 | `4c0ac26` | PR workspace: "Why this is risky" banner with jump to riskiest file |
| 2026-10-30 | #166 | `6926c08` | Inbox: group by repo with counts, "Needs my review" filter label |
| 2026-10-30 | #167 | `a3b70cf` | Ask this PR: three starter questions based on the PR's files |
| 2026-10-30 | #168 | `274002c` | Review plan: copy checklist as Markdown |
