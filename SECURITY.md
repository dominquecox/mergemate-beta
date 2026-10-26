# Security

- No secrets in the repository, issues, PRs, logs or chat. Only names belong in `.env.example`.
- Provider, model and GitHub credentials live server-side (Worker secrets). The mobile app holds only its own app session, in secure storage.
- `EXPO_PUBLIC_*` variables ship inside the app bundle: public values only.
- Email and bot-check: `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` are Worker secrets only. The Turnstile site key is public; the secret never is. Never paste either into chat, issues or PRs.
- Model and provider are server-side configuration. Invalid or missing configuration must fail visibly, never fall back to another model.
- Do not send secrets, personal tokens or private source to a model.
- If a secret is committed, rotate it first, then remove it from history.

Report a vulnerability privately to the repository owner.
