# Validation

Checks on this repository as published (November 5, 2026).

| Check | Result |
| --- | --- |
| Secret scan: Gitleaks over the full history (`gitleaks detect --source . --log-opts="--all"`) | No leaks found |
| History | One company identity on every commit; real dates; no personal names, emails, machine paths or private infrastructure identifiers |
| Typecheck and lint (`npm run typecheck`, `npm run lint`) | Clean |
| Image metadata | No GPS, camera, author or serial metadata |

Three mobile UI-layout tests still assert the pre-redesign layout (bottom-tab hiding, the run-receipt wrapper and a symbol check on the board screen). They are being updated to the new layout; the application code they cover is in place.

The repository's `.gitleaks.toml` allowlists only public test vectors. It contains the full development history, prepared as described in [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md), and no issues, pull requests, logs or private operator records.
