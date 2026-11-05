# Validation — November 4, 2026

Validation was run locally against the tip of this repository (MergeMate beta, web only). Counts in the table are from the November 4 snapshot refresh of the same application source; the history preparation itself is recorded in SOURCE_PROVENANCE.md. No remote deployment, migration, native compilation, store upload, live provider inference or final submission was performed.

| Check | Result |
| --- | --- |
| Clean lockfile install (`npm ci --ignore-scripts`) | Exit 0 |
| Monorepo typecheck and lint (`npm run check`) | Exit 0 |
| API tests | 819/819 |
| Mobile tests | 549/549 |
| Web tests | 41 passed, 3 skipped (unchanged skips) |
| Brain MCP server tests (includes a real stdio round trip) | 14/14 |
| Contract tests | 58/58 |
| Site tests | 19/19 |
| Agent executor adversarial suite | 15/15 |
| Web export | Exit 0 |
| `security:bundles` | Exit 0; reported affected packages absent from inspected runtime bundles; tooling advisories remain open |
| Secret patterns | Pattern scan for cloud, GitHub, Stripe, Slack, Google, private-key, JWT, webhook and MergeMate agent-token shapes: no real credentials (two matches are PEM-parsing code and a test that builds a key at run time). The pinned Gitleaks binary was not available in this environment for the refresh; see below |
| Privacy review | No internal hosts, mesh or tailnet addresses, device IDs or private planning references; synthetic config-test LAN address and the public business contact retained, as before |
| Image metadata | 17 image assets: no GPS, camera, author or serial metadata |

**Gitleaks.** The November 2 snapshot passed pinned Gitleaks 8.24.2 on its tree and history. This refresh could not run Gitleaks in its build environment. Run it once before publishing: `gitleaks detect --source . --log-opts="--all"`. The repository's `.gitleaks.toml` allowlists only public test vectors.

The board features (`brain` flag) and agent runs (a separate operator kill switch) are off by default and off in production. An agent opens a draft pull request only after the owner approves the exact patch with a passkey; no tests are run on the patch in this beta, and nothing merges on its own. Local fixture results are not proof of real GitHub login, live Meta model execution or physical-device behavior.

This repository includes the full development history, prepared as described in SOURCE_PROVENANCE.md. It does not include issues, pull requests, logs or private operator records.
