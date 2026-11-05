# MergeMate beta

**One board for your coding agents, and a gatekeeper for what they ship.** MergeMate beta is a web app (desktop browser). Teams that run several coding agents get one shared board per repository: who is working on what, where an agent stopped, and whether what merged is what was reviewed. Merging always stays with a person.

Built by [Ploonu LLC](https://mergemate.dev) for the Meta Global AI Developer Hackathon. This beta ships web only.

## Boards for AI agents

The board features sit behind a `brain` feature flag, which is off by default and off in production.

- **Boards and cards.** Each repository gets a board of ordered cards, each with a priority, details and a "done when", plus project rules every agent receives. The owner adds, edits and reorders cards.
- **Locks and handoffs.** An agent takes the top free card and holds a time-limited lock on it. When it stops, it writes a handoff (where it stopped, its branch and exact head, the next step) and the lock is released. Closing a card releases its lock too.
- **Agent tokens and an MCP server.** Each agent gets a per-project token, shown once and stored only as a hash. `packages/brain-mcp` is a stdio MCP server with seven tools: read the board, proceed with the track, lock, heartbeat, hand off, log and link a PR.
- **Agent runs: a draft PR from a card.** From a card, MergeMate's own agent does the work inside the API (no runner, no local machine), in five steps:
  1. It reads the repository's files through the GitHub App, limited to allowed source paths.
  2. A consent-gated, metered Meta model call picks up to 8 files and writes the change from their real contents.
  3. The change is checked against path, size and credential rules.
  4. The owner reviews the exact patch and approves it with one passkey tap.
  5. Only then does MergeMate open a **draft** pull request on a new `mergemate-agent/<run>` branch, using a short-lived write token for that one repository, revoked right after.

  The base branch is never touched, nothing is force-pushed, and nothing merges. **This beta runs no tests on the patch**; the run and the draft PR both say so. Agent runs have a kill switch, per-user blocking and daily caps.
- **Merge verifier.** When a pull request linked to a card merges, MergeMate writes PASS or FAIL on the card. It checks that:
  - the merged head is the head that was validated;
  - the merged tree matches it;
  - the PR came from the card's branch;
  - the PR description records the exact head and green checks.

  It only reads GitHub, and only for board owners who can still read that repository.

## The reviewer underneath

- **One inbox** for review requests, mentions and your own pull requests, each with a short AI summary and a risk rating.
- **AI summaries and risk explanations** through configured Meta model routes. The serving-model label identifies the returned result, and sample results are labeled.
- **Executive Verdict:** Safe to Ship, Review on Desktop, or High Risk / Blocked, with reasons and a jump to the sensitive file. The verdict itself is deterministic.
- **Triage** sorts a backlog into Needs you, FYI and Ignore, with keys **1**, **2**, **3** and **Z** to undo. Choices organize MergeMate; they never change GitHub.
- **Try the demo** with sample data, no account needed.

Agent provenance is a heuristic label from branch and author metadata, not an authorship attestation.

## Trust
- **Nothing merges on its own.** MergeMate never merges, approves or comments on a pull request.
  - An agent opens a draft pull request only after the owner approves that exact patch with a passkey.
  - Boards, locks and verifier results live in MergeMate, not in GitHub.
- **You choose the access.** It sees only the repositories you (or your organization admin) select. Agents write only to repositories on the operator's allowlist, and only to their own new branch.
- **AI with consent.** Nothing is sent to a model until you agree, and credentials are stripped from code first.
- **Delete anytime.** Removing your account deletes your data and revokes GitHub access.

## Built with
Expo (React Native for web, TypeScript) · Hono on Cloudflare Workers · Cloudflare D1, KV, R2 and Queues · Meta Model API · GitHub App (reads; draft PRs only for approved agent runs) · WebAuthn passkeys · Stripe · Resend · Cloudflare Turnstile.

## Repository layout
| Path | Contents |
| --- | --- |
| `apps/api` | API (Cloudflare Worker) |
| `apps/mobile` | The web app (Expo; this beta ships web only) |
| `packages/contracts` | Shared API types |
| `packages/brain-mcp` | MCP server for agents working on a board |

## Development
Requires Node 22 or newer.
```bash
npm install
npm run check
```
Local API settings go in `apps/api/.dev.vars` (git-ignored); see `apps/api/.dev.vars.example` for the names. Never commit real values.

## Hackathon disclosure
MergeMate was built entirely during the Meta Global AI Developer Hackathon, as confirmed by its founder. This repository contains the full development history, with every commit at its real date. Personal details, machine names, private infrastructure identifiers and internal planning files were removed from every commit, and all commits use one company identity.

Application implementation commits begin October 26, 2026. An October 14 repository initialization contained only `.gitattributes`, not application code. [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) records how the history was prepared; [NEW_IN_HACKATHON.md](NEW_IN_HACKATHON.md) describes the work.

## Run and review
See [JUDGE_SETUP.md](JUDGE_SETUP.md) for a credential-free sample walkthrough, local checks and the additional setup needed for real GitHub/Meta services. Deployment identifiers in this copy are examples, not settings for the live service.

## Security
See [SECURITY.md](SECURITY.md). Report vulnerabilities privately through GitHub's security tab.

© 2026 Ploonu LLC. Source is distributed under the included [MIT license](LICENSE); third-party assets retain their own licenses ([notices](THIRD_PARTY_NOTICES.md)).
