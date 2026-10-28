# Security

- No secrets in the repository, issues, PRs, logs or chat. Only names belong in `.env.example`.
- Provider, model and GitHub credentials live server-side (Worker secrets). The mobile app holds only its own app session, in secure storage.
- `EXPO_PUBLIC_*` variables ship inside the app bundle: public values only.
- Email and bot-check: `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` are Worker secrets only. The Turnstile site key is public; the secret never is. Never paste either into chat, issues or PRs.
- Model and provider are server-side configuration. Invalid or missing configuration must fail visibly, never fall back to another model.
- Do not send secrets, personal tokens or private source to a model.
- If a secret is committed, rotate it first, then remove it from history.

Report a vulnerability privately to the repository owner.

## Reproducible local dependency and bundle review

Run `npm ci --ignore-scripts` followed by `npm run check`. Use `npm audit --json` and `npm audit --omit=dev --json` separately: framework packages can include build tools in their dependency trees, so omit-dev alone is not a shipping assessment.

`npm run security:bundles` records both audit results, builds the production API with Wrangler metadata, and exports web/iOS/Android JavaScript with source maps. Supply the intended public API URL through the existing public environment setting. Build outputs, audit reports and command logs remain in a new temporary directory; the final JSON reports its location and exact exit codes. No deployment or native compilation is performed. Inspect the reports before deleting the temporary directory. Never publish source maps or raw scan artifacts automatically.

The command compares directly affected installed package paths against actual bundle inputs. It fails if an affected dependency ships, a new high/critical dependency requires assessment, or any build/audit operation fails. Transitive parent alerts are retained in its report; a CLI loader shipping does not prove that its separate schema-validation dependency ships. Test the gate with `node --test scripts/security-evidence.test.mjs`.

Assessment on 2026-10-28: both npm audits exit 1 (3 high, 5 low). The high entries are Expo and its CLI depending on nested Zod 3.25.76 (GHSA-mrhx-c7xc-m3w5). Runtime Zod is 4.6.7. Available compatible Expo 58.0.20 / CLI 58.1.16 still request Zod ^3.25.76. Forcing Zod's major API across that dependency or downgrading Expo is not a verified compatible fix. API, web, iOS and Android JS bundle evidence excludes the affected nested Zod and the reported deepmerge package. This establishes non-shipping for those artifacts only; the tooling audit remains open and build/development processes still need trusted inputs and restricted exposure. It is not an advisory dismissal or a claim of a clean npm audit. Re-run after any lockfile/build change and before release.

## Redacted secret scans

Install Gitleaks, then run `npm run security:secrets -- <bundle-evidence-output-directory>` to scan current source, reachable HEAD history, and generated release artifacts. Omit the optional argument only for a source/history scan. All reports use redaction and remain in a temporary directory. The command preserves a nonzero exit for any finding or scanner failure; it never silently treats missing tools as a pass.

Current source and generated artifacts scanned clean in the assessment above. Reachable-history scan exits 1 for a generic-key pattern in a mocked HTTP-client test: it is a literal synthetic input in a local fake transport, with no provider request. The historical scanner result remains visible and requires reviewer classification; no global rule suppression or history rewrite is performed. Scanner results cannot establish that all credentials are safe or that deployed/native builds match these artifacts. Rotate any actual exposed credential before remediation.
