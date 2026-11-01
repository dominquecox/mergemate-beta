# MergeMate

**The PR gatekeeper for teams shipping with AI agents.** MergeMate helps tech leads decide what needs their attention from an iPhone or the web: a five-second executive verdict, screenshot inspection with Meta AI, and a swipe triage deck. It organizes review and explains risk; the human keeps the shipping decision.

Built by [Ploonu LLC](https://mergemate.dev) for the Meta Global AI Developer Hackathon.

## What it does
- **One inbox** for review requests, mentions and your own pull requests, each with a short AI summary and a risk rating.
- **AI summaries and risk ratings** powered by Meta's Muse Spark through the Meta Model API.
- **Swipe triage** to sort a backlog into Needs you, FYI and Ignore.
- **Highlight**: upload a screenshot of a failing build or a bug and get the important parts explained.
- **Try the demo** with sample data, no account needed.

## Why MergeMate

Copilot helps explain a code diff, and GitHub Mobile brings GitHub to a phone. MergeMate focuses on the tech lead facing a queue of agent-authored pull requests: **“Can I safely ship this right now without opening my laptop?”** Its answer is a review signal, never an approval or a guarantee.

| Review moment | MergeMate's focus |
| --- | --- |
| Five seconds to decide where to look | Executive Verdict: Safe to Ship, Review on Desktop, or High Risk / Blocked, with reasons and a jump to the sensitive file. Verdict rules combine reported risk, sensitive paths, check failures and secret warnings; the verdict itself is deterministic. |
| A mobile UI change to inspect | Highlight can use Meta SAM-3.1 to locate screenshot regions before vision analysis explains potential small touch targets and clipping. Human inspection verifies actual dimensions and behavior. |
| Sixty seconds to sort the queue | Triage Deck: Ignore, FYI or Needs you, with desktop keys **1**, **2**, **3** and **Z** to undo. Choices organize MergeMate; they never change GitHub. |

Agent provenance identifies likely agent-authored PRs from branch/author metadata and available trailers. It is a heuristic label, not an authorship attestation. Five and sixty seconds describe the intended interaction, not measured performance benchmarks or guarantees. This positioning describes MergeMate's workflow, not an exhaustive comparison of competing products.

## Three-minute hackathon pitch

**Hook:** AI agents can open pull requests faster than a tech lead can review them. Reading 800 lines on an iPhone is not a useful way to catch up. MergeMate turns that queue into a short decision: inspect here, review on desktop, or move on.

**Demo:** follow sample PR **7** (low-risk scaffold), **412** (Auth/Stripe risk), then **9** (visual UI audit). Show the verdict and agent label, inspect the risky file, demonstrate the labeled screenshot sample, and finish by sorting the deck with **1 / 2 / 3 / Z**. All samples are canned; they make no model calls. Live Highlight requires consent, its feature flag and configured providers.

**Close:** “MergeMate is the review gatekeeper for teams building with AI agents: understand risk in five seconds, inspect the UI, and organize the queue in sixty. Your code stays under your control.”

The [final timed narration and demo cues](NEW_IN_HACKATHON.md#three-minute-submission-script) cover the full three minutes, with model and demo disclosures. Startup-track submission deadline: **November 4, 2026, 9 PM Eastern**.

## Trust
- **Read-only.** MergeMate never merges, approves, comments on or changes anything in GitHub.
- **You choose the access.** It sees only the repositories you (or your organization admin) select.
- **AI with consent.** Nothing is sent to a model until you agree, and credentials are stripped from code first.
- **Delete anytime.** Removing your account deletes your data and revokes GitHub access.

## Built with
Expo (React Native, TypeScript) for iOS and web · Hono on Cloudflare Workers · Cloudflare D1, KV and R2 · Meta Model API (Muse Spark) · GitHub App (read-only) · Stripe (web) · Resend · Cloudflare Turnstile.

## Repository layout
| Path | Contents |
| --- | --- |
| `apps/api` | API (Cloudflare Worker) |
| `apps/mobile` | iOS and web app (Expo) |
| `packages/contracts` | Shared API types |

## Development
Requires Node 22.
```bash
npm install
npm run check
```
Local API settings go in `apps/api/.dev.vars` (git-ignored); see `apps/api/.dev.vars.example` for the names. Never commit real values.

## Hackathon disclosure
All code in this repository was written during the hackathon, starting October 26, 2026. The repository began empty; the commit history shows the work as it happened.

## Security
See [SECURITY.md](SECURITY.md). Report vulnerabilities privately through GitHub's security tab.

© 2026 Ploonu LLC. All rights reserved.
