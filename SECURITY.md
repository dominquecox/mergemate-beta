# Security

- No secrets in the repository. Only variable names belong in `.env.example` and `.dev.vars.example`.
- Provider, model and GitHub credentials live server-side as Worker secrets. GitHub tokens are encrypted at rest. `EXPO_PUBLIC_*` values ship in the web bundle and are public by design.
- Agents never merge. A patch leaves MergeMate only after the owner approves that exact patch with a passkey, and only as a draft pull request on its own branch, using a short-lived token revoked right after.
- Screenshots are processed in memory and never stored. Voice audio is discarded after transcription.
- The published history was scanned with Gitleaks (`gitleaks detect --source . --log-opts="--all"`): no leaks found. `.gitleaks.toml` allowlists only public test vectors.

Report a vulnerability privately with the "Report a vulnerability" button on the repository's Security tab. Please don't open a public issue for it.
