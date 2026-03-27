# Repo notes

- OAuth env vars live in `.env.local` and `.env.example`
- OAuth routes:
  - `app/api/auth/google/start/route.ts`
  - `app/api/auth/google/callback/route.ts`
  - `app/api/auth/google/status/route.ts`
- Workspace test route:
  - `app/api/google/workspace-test/route.ts`
- Main Google integration logic:
  - `lib/google-auth.ts`
  - `lib/google-workspace.ts`
- Current pattern:
  - user OAuth is the preferred mode for personal Google accounts
  - service account mode remains for Workspace-style automation
