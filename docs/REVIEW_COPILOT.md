# Review copilot: review plan, ask this PR, AI engine (MM-073 to MM-075)

MergeMate prepares the human reviewer; it never writes to GitHub. These features keep that line.

## Review plan
`POST /v1/prs/:owner/:repo/:number/plan` returns `readingOrder` (files with a reason each), `verify` (checks before approving) and `draftComment`. The draft is for copying (web) or sharing (native); nothing is posted. It uses the summary route, the same consent and "AI summaries and risk" setting, the same secret redaction and the same head-commit cache as the summary, and counts as one action. Files the model names that are not in the PR are dropped server-side. Built on request from the PR screen, not automatically.

## Ask this PR
`POST /v1/prs/:owner/:repo/:number/ask` with `{"question": "..."}` (3 to 300 characters, no other fields). One reserved action per question, never cached. The question and the PR are both redacted before the model sees them; the PR is sent as untrusted data and the question in its own tag. Citations outside the PR's files are dropped.

## Model provenance and AI engine
New summaries, plans and answers carry `model` (`provider:model`, for example `meta:muse-spark-1.3`); the PR screen shows it as "Meta Muse Spark 1.3". Older cached summaries have no `model` and show none. `GET /v1/ai/engine` (signed in) returns the active `AI_PROFILE` and the configured model per job (names only, no keys or URLs); Settings shows it under "AI engine". Demo sessions show fixtures labelled "Sample data".

## Demo sessions
Plan and ask answer from fixtures for demo sessions, with no model call.

## Tests
API: `apps/api/test/ai-assist.test.ts`, `ai-routes.test.ts`. Mobile: `apps/mobile/test/review-copilot.test.ts`.
