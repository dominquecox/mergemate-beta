# Isolated coding-agent executor

This runner is the configured execution backend for code-fix workflows. It is separate from the trusted operator QA script. The browser/API never execute repository code. Code fixes are limited by an owner-controlled repository/source/test policy, pinned source SHA, an active server job lease, actual isolated tests and GitHub write permissions. Missing setup reports blocked rather than a successful agent run. No automatic merge, native build, signing or store upload is supported.

Implementation is being checkpointed before long tasks. The runnable CLI, deployment protocol, fixture tests and exact setup instructions follow in the next executor checkpoint.
