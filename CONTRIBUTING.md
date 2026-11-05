# Contributing

- Branch from `development` and open one pull request into `development`.
- Run typecheck, lint and the tests for the package you touched, plus `gitleaks detect --redact`, before pushing.
- Add dependencies only with the lockfile, in the package that needs them.
