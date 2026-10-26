# MergeMate

**Code review that fits in your pocket.** MergeMate connects to GitHub, finds the pull requests that need you, and uses Meta's Muse Spark model to explain each one: what changed, why it matters, how risky it is, and where to look first. On iPhone and the web.

Built by [Ploonu LLC](https://mergemate.dev) for the Meta Global AI Developer Hackathon.

## What it does
- **One inbox** for review requests, mentions and your own pull requests, each with a short AI summary and a risk rating.
- **AI summaries and risk ratings** powered by Meta's Muse Spark through the Meta Model API.
- **Swipe triage** to sort a backlog into Needs you, FYI and Ignore.
- **Highlight**: upload a screenshot of a failing build or a bug and get the important parts explained.
- **Try the demo** with sample data, no account needed.

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
