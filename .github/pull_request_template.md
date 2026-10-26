## What and why

## Card
MM-___ (lane: API | UI | admin | tooling)

## Proof (local gates; CI is off)
- `npm run typecheck`: exit __
- `npm run lint`: exit __
- `npm run test`: exit __
- Secret scan (`gitleaks detect --redact`): exit __
- Commit SHA: ____

## Checklist
- [ ] Only files in my lane's paths changed (see docs/OWNERSHIP.md)
- [ ] No secrets, keys, tokens or real emails in code, tests, fixtures or logs
- [ ] No endpoint or screen that merges, approves or otherwise acts on GitHub without an explicit user tap
- [ ] New or changed API shape is in packages/contracts and docs/specs/API.md
