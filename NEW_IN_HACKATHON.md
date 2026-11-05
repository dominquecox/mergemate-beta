# Built during the hackathon

The repository was created on October 14, 2026 with a single `.gitattributes` commit. All application work happened during the Meta Global AI Developer Hackathon, starting October 26, 2026. Every commit keeps its real date; see [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).

## What was built

- **PR review:** an Inbox of review requests, mentions and your own pull requests. Each PR gets a Muse Spark summary, a risk read with reasons, blast radius, agent guardrail checks, "Ask about this PR" and a review plan, in one tabbed page.
- **Triage:** sort a backlog into Needs you, FYI and Ignore. Choices never change GitHub.
- **Boards for coding agents:** one board per repository, with cards, project rules, time-limited locks, handoffs, a track timeline, per-project agent tokens and a stdio MCP server (`packages/brain-mcp`).
- **Board agent:** from a card, Muse Spark reads the repository at a pinned commit, picks the files and writes the patch. The owner approves the exact diff with a passkey, and only then does MergeMate open a draft pull request on a `mergemate-agent/<run>` branch. Kill switch, per-user blocking and daily caps.
- **Capture:** screenshot insights (Muse Spark vision with SAM 3.1 boxes), voice notes (Muse Voice Transcribe) and text notes, each saved to a board as a card or as a private note on a card.
- **Merge verifier:** on a merged PR linked to a card, checks that what merged is what was validated, and writes PASS or FAIL on the card.
- **Platform:** Hono API on Cloudflare Workers with D1, KV, Queues and Durable Objects; Expo web app; GitHub App; WebAuthn passkeys; Stripe billing.

PR numbers in commit messages refer to the private development repository.
