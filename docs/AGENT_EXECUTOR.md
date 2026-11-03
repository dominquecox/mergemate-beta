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

The backend uses `WORKFLOW_QUEUE`, server secret `WORKFLOW_RUNNER_TOKEN` (at least32 characters), and nonsecret comma-separated `WORKFLOW_RUNNER_REPOS`. Store server configuration with the authorized Cloudflare secret/config tooling; the token is entered locally:

```bash
cd ~/code/mergemate && npx wrangler secret put WORKFLOW_RUNNER_TOKEN --config apps/api/wrangler.toml --env dev
cd ~/code/mergemate && npx wrangler secret put WORKFLOW_RUNNER_REPOS --config apps/api/wrangler.toml --env dev
```

Enter only the explicitly approved repository allowlist for `WORKFLOW_RUNNER_REPOS`. Apply migration0018 and deploy API/web with the canonical Brain dev release flow; do not migrate production. Ensure the internal runner routes are reachable under the owner's approved network/Access policy. They require the dedicated bearer credential, reject browser Origin requests, and are not user session endpoints. Do not weaken Access or put its service credentials in the app to connect this runner.

2. Pull/review an image, then create a policy using its actual local digest. This helper never pulls or starts an image and refuses to overwrite an existing policy:

```bash
cd ~/code/mergemate && docker pull node:22-bookworm-slim
cd ~/code/mergemate && node scripts/agent-init-policy.mjs --repo dominquecox/mergemate --output "$HOME/.config/mergemate/agent-policy.json"
```

Review the generated digest, source roots and test commands. Defaults permit only selected mobile/web/contracts source/test roots; auth/session/billing/configuration/migrations remain protected. Default ceilings include8 changed files,128KiB patch,64MiB download,256MiB expanded source,20,000 archive entries,2GiB workspace tmpfs and3GiB container memory. Per-command test limit is10minutes, install5minutes, captured output1MiB; trusted configuration can lower them and has hard upper bounds. Docker runs on the host's non-root UID/GID; a root runner is refused. The repo's current npm test toolchain may require a reviewed image/toolchain adjustment—do not infer successful native/runtime acceptance from fixture tests.

3. Load `MERGEMATE_RUNNER_TOKEN` from the owner's secure shell with the same value as server `WORKFLOW_RUNNER_TOKEN`, and load a narrowly scoped `GITHUB_TOKEN` for the allowed repositories (contents and pull requests writes). Credentials are never command-line arguments. The runner verifies repository write capability before advertising readiness and rechecks per job/publication. A fine-grained token/App without provable permissions remains blocked.

```bash
cd ~/code/mergemate && node scripts/agent-executor.mjs --config "$HOME/.config/mergemate/agent-policy.json" --check
cd ~/code/mergemate && node scripts/agent-executor.mjs --config "$HOME/.config/mergemate/agent-policy.json"
```

`--check` checks local image and live configured capability/heartbeat only; it does not claim or publish a job. `--once` may execute one authorized queued job, including a draft PR when tests pass; use it only after reviewing the policy and run authorization. Stop with Ctrl-C; leases/cancellation fence further work. No production or native build command is part of setup.

## Verification performed

Run `node scripts/agent-tests.mjs` for bounded fixture/adversarial coverage. Tests use fake Docker/GitHub/bridge adapters and trusted local process-output/cancellation fixtures; they never run repository code in a container or publish anything. Coverage includes archive bombs/links/path metadata, protected/symlink/secret patches, context bounds, read-only/tmpfs/no-network test configuration, cleanup failure, output limits, cancellation/expired leases, exact base-tree publication, permission refusal, branch collisions, retry reconciliation, partial publication and full pipeline ordering/failure. No real Docker job, model-generated fix or GitHub draft PR has been executed by this source verification; owner runtime smoke remains necessary.
