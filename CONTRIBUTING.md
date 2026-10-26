# Contributing

- Branch `feat/<ID>-<slug>` or `fix/<ID>-<slug>` from `development`; open one ready-for-review PR into `development`. `main` changes only through an owner-approved release PR.
- Run the local gates for the package you touched (typecheck, lint, test) and a secret scan (`gitleaks detect --redact`) before pushing. Put commands, exit codes and the commit SHA in the PR.
- CI is off. Never add or enable workflows without the owner.
- Add dependencies only with a lockfile, in the package that needs them.
- Disclose pre-existing or third-party code clearly; do not copy code without rights.
