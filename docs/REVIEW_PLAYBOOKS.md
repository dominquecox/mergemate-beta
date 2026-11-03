# Agent workflows

The agent workspace replaces the earlier manual-only playbook screen. It provides a natural-language task builder, editable validated workflow graph, templates for PR review and coding tasks, actual runtime capability checks, durable run history, cancellation and per-step execution receipts.

## Build and run

Open Agent workflows from the Inbox or desktop sidebar. A PR detail link may prefill a target URL and mode; prefills never start a run. Add a direct HTTPS GitHub PR URL for review. Coding tasks accept a GitHub issue, repository or PR URL and use the backend-pinned commit. URLs with credentials, external domains, queries or fragments are refused.

Choose a template to inspect/edit its steps without invoking a model, or describe a task and Generate workflow. Generation and execution require current AI consent and an authenticated workflow API; the demo can preview templates but does not fabricate agent runs. Required dependencies keep context first and coding patch → tests → draft PR ordered. A disabled step is a planned skip, not completed work.

Run review workflow executes supported analysis through the configured backend. Run coding workflow additionally requires an explicit per-run authorization to prepare changes, execute isolated tests and create a branch/commit/draft PR if tests pass and permissions permit it. This authorization never merges or releases a change. The UI does not silently expand GitHub permissions.

The capabilities panel reports the actual backend model/queue and coding-executor readiness. Unconfigured or stale integrations remain disabled with their reason. No browser-side code execution, fake test success or invented run counts are shown. Existing GitHub check evidence is labeled separately from tests actually executed by the isolated coding runner.

## Execution receipts and lifecycle

Runs are account-owned backend records. Their pending/running/failed/blocked/cancelled/succeeded states and per-step output come from API responses. Active runs are polled while the screen is focused; returning reconnects to the selected run. Cancel asks the backend and retains the previous state if that request fails. Retrying a failed/blocked/cancelled run returns its definition to the builder and clears code-write authorization for fresh review.

An uncertain start preserves its idempotency key until a confirmed response, reducing duplicate run creation on retry. Older run revisions cannot replace newer receipts. Account changes, sign-out and component teardown abort requests and clear in-memory private results. The screen uses the existing cookie/CSRF/native-bearer transport, not a separate insecure API path.

Output/evidence is bounded for display and treated as untrusted text. Generated draft PR links are opened only when they are direct HTTPS GitHub PR URLs in the target repository. No model-generated HTML or arbitrary links are rendered.

## Release and acceptance

Backend schema, queues, model policy and isolated executor provisioning are prerequisites documented with the API/runner implementation. A source merge does not prove these services are configured. Browser fixtures certify layout and interaction only; they do not certify live model inference, real GitHub permissions, native keyboard/speech or an actual coding run.

Validate360/393/1440px, dark/light, keyboard and44pt controls; target compatibility, consent gates, graph dependency edits, stale requests, idempotent starts, real status polling/cancellation, failed storage/network and capability errors. Native builds, signing and installation remain owner-operated.
