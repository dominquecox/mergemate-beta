# MergeMate

Mobile-first assistant that helps developers keep up with their GitHub pull requests and notifications. Early scaffold.

## Layout

| Path | Purpose |
| --- | --- |
| `apps/api` | Server (Cloudflare Worker, TypeScript) |
| `apps/mobile` | Mobile app (Expo, React Native, TypeScript) |
| `packages/contracts` | Shared API types, defined before clients |
| `docs` | Public-safe documentation |

## Setup

No dependencies yet. Copy `.env.example` to `.env` for local use (git-ignored). Secrets never go in the repo; see `SECURITY.md` and `CONTRIBUTING.md`.
