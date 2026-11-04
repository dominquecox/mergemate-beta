# Isolated coding-agent executor

This owner-operated runner is the code-fix execution backend, separate from the trusted operator QA script. The API/browser do not run repository code. Jobs require a configured server queue, fresh runner heartbeat, account/repository authorization and explicit run-level code-change authorization. The API validates the target and pins its SHA; issue/repository jobs use a pinned base branch, while PR jobs require an open same-repository head. The executor never merges, approves, comments, builds native apps, signs binaries or uploads to stores.

## Real execution and boundaries

The runner claims a renewable 30-second lease through `/internal/workflows`; backend policy bounds job lifetime. It rechecks leases during execution and before publishing. It downloads the exact GitHub archive, permits redirects only to that repository/SHA on GitHub/codeload, and strips the host GitHub credential from codeload requests. Compressed bytes, expanded bytes, entries and metadata are bounded. Tar validation rejects traversal, multiple roots, links, devices, duplicate files, sparse/unsupported metadata and malformed streams before extraction.

Validated archive extraction uses a one-off non-root Docker process with no network. Untrusted dependency/test execution then uses a separate persistent container: read-only root filesystem; all capabilities dropped; no-new-privileges; non-root UID/GID; bounded CPU, memory/PIDs/output/time; read-only host source/manifest/helper mounts; and a size-bounded `/workspace` tmpfs. There is no host socket, home directory or publishing credential in the container. `npm ci --ignore-scripts` fetches integrity-pinned registry dependencies with install scripts disabled. This preparation phase has bridge networking; locks with non-registry URLs, repository npm configuration and unsafe workspace links are refused. Bridge networking is explicitly disconnected before any repository test command. Tests cannot use external services. Repositories needing installation scripts, non-npm dependencies or networked tests need a separately reviewed policy/image; this runner reports failure rather than enabling them silently.

Patch generation is provider/consent/budget-gated at the API. The runner sends bounded permitted source context, validates returned paths/content/file/byte limits and credential patterns, and refuses protected auth/config/secret files by default. Owner-local path exceptions cannot override stricter backend scope. Model output never supplies a shell command. Owner policy supplies fixed argv test commands.

Before publication, original and patched source manifests are verified inside the test container; source changes, new source files or symlinks introduced by tests cause failure. The read-only host source is independently checked again. Actual test commands, numeric exit status, duration and output SHA-256 are recorded. Test output bodies are not uploaded. These are configured-runner receipts, not independently signed attestations. Passing tests are not a safety guarantee.

Publishing uses host-only credentials after all tests pass. It verifies exact repository write access, source head, patch contents, current lease and actual Git tree identity. It creates an agent branch, commit and **draft PR**. Retries reconcile the same exact branch/tree/parent/run message and existing draft PR instead of forcing refs or creating duplicate PRs. A moved/colliding branch blocks. Cancellation is checked before visible writes; an already in-flight network write may complete. Partial branch publication retains its commit receipt and tells the owner to inspect GitHub. Created GitHub branches/PRs are external artifacts and are not erased by deleting a MergeMate account.

Container removal must return confirmed success; otherwise the runner reports `container_cleanup_failed` and stops. Scratch files are removed after each job. A Docker/storage/runtime error never produces a successful run.

## One-time owner setup (dev only)

Prerequisites: supported Node22+, GitHub API access, Docker, a non-root local user, and a reviewed image containing Node/npm/tar. No runner token or GitHub credential belongs in source, chat, browser variables, model prompts or policy JSON.

1. Provision the dev queue and API migration/bindings through the backend release runbook. Queue creation is owner-operated:

```bash
cd ~/code/mergemate && npx wrangler queues create mergemate-workflows-dev
```

The backend uses `WORKFLOW_QUEUE`, a server-only `WORKFLOW_RUNNER_SIGNING_KEY` (at least 32 characters), nonsecret comma-separated `WORKFLOW_RUNNER_REPOS`, and the exact Cloudflare Access application values `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. Store the signing key with the authorized Cloudflare secret tooling:

```bash
cd ~/code/mergemate && npx wrangler secret put WORKFLOW_RUNNER_SIGNING_KEY --config apps/api/wrangler.toml --env dev
```

Enter only the explicitly approved repository allowlist for `WORKFLOW_RUNNER_REPOS` in reviewed Wrangler vars, and set the Access team origin/audience there without credentials. Apply migrations through 0019 and deploy API with the canonical Brain dev release flow; do not migrate production. Protect `/internal/*` with a Cloudflare Access service-token policy. The Worker validates the Access JWT again, then validates a short-lived runner credential bound to one runner and its repository set. Browser Origin requests are refused. Access credentials belong only on the owner-operated runner.

2. Pull/review an image, then create a policy using its actual local digest. This helper never pulls or starts an image and refuses to overwrite an existing policy:

```bash
cd ~/code/mergemate && docker pull node:22-bookworm-slim
cd ~/code/mergemate && node scripts/agent-init-policy.mjs --repo dominquecox/mergemate --output "$HOME/.config/mergemate/agent-policy.json"
```

Review the generated digest, source roots and test commands. Defaults permit only selected mobile/web/contracts source/test roots; auth/session/billing/configuration/migrations/deploy policy remain protected. Default ceilings include 8 changed files, 128 KiB patch, 16 MiB download (32 MiB hard ceiling), 256 MiB expanded source, 20,000 archive entries, 2 GiB workspace tmpfs and 3 GiB container memory. Per-command test limit is 10 minutes, install 5 minutes, captured output 1 MiB; trusted configuration can lower them and has hard upper bounds. Docker runs on the host's non-root UID/GID; a root runner is refused. The repo's current npm test toolchain may require a reviewed image/toolchain adjustment—do not infer successful native/runtime acceptance from fixture tests.

3. Mint a runner-specific credential locally for no more than 30 days, then load it as `MERGEMATE_RUNNER_CREDENTIAL`. Load the Access service token as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. Credentials are never command-line arguments or policy JSON. The signed credential is bound to the runner ID and repository list; the API intersects that list with its server allowlist on every heartbeat.

```bash
cd ~/code/mergemate && node scripts/mint-runner-credential.mjs fixture-runner dominquecox/mergemate 1 7
```

The mint command reads `WORKFLOW_RUNNER_SIGNING_KEY` from the secure local environment and prints the credential once for secure storage. Increment the generation for each rotation; the API persists the current generation/JTI and rejects older credentials on every internal request.

To revoke one runner immediately, execute the following against the intended D1 environment after replacing `RUNNER_ID`. Keep the quotes and verify the affected-row count is exactly one:

```sql
UPDATE workflow_runners SET revoked_at = datetime('now') WHERE id = 'RUNNER_ID' AND revoked_at IS NULL;
```

Do not clear `revoked_at` to reuse an old credential. Re-enrollment requires an owner-reviewed new runner identity, or an explicit incident-recovery decision followed by a higher generation and a new JTI. Revoking one row does not affect other runner identities. The runner has no host-wide GitHub token. After a tenant and immutable-repository check, the API mints a short-lived GitHub App installation token restricted to that one repository, then sends it only with the leased job. Configure `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` as server secrets; the private key never reaches the browser, model, repository, policy file or logs.

```bash
cd ~/code/mergemate && node scripts/agent-executor.mjs --config "$HOME/.config/mergemate/agent-policy.json" --check
cd ~/code/mergemate && node scripts/agent-executor.mjs --config "$HOME/.config/mergemate/agent-policy.json"
```

`--check` checks local image and live configured capability/heartbeat only; it does not claim or publish a job. `--once` may execute one authorized queued job, including a draft PR when tests pass; use it only after reviewing the policy and run authorization. Stop with Ctrl-C; leases/cancellation fence further work. No production or native build command is part of setup.

## Verification performed

Run `node scripts/agent-tests.mjs` for bounded fixture/adversarial coverage. Tests use fake Docker/GitHub/bridge adapters and trusted local process-output/cancellation fixtures; they never run repository code in a container or publish anything. Coverage includes archive bombs/links/path metadata, protected/symlink/secret patches, context bounds, read-only/tmpfs/no-network test configuration, cleanup failure, output limits, cancellation/expired leases, exact base-tree publication, permission refusal, branch collisions, retry reconciliation, partial publication and full pipeline ordering/failure. No real Docker job, model-generated fix or GitHub draft PR has been executed by this source verification; owner runtime smoke remains necessary.
