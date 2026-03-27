---
name: google-auth-platform-oauth-setup
description: Set up Google Auth Platform for local and server apps using Google Workspace APIs. Use when Codex needs to create or repair OAuth consent configuration, OAuth client IDs, redirect URIs, client secret JSON downloads, or local env wiring for Google Drive, Docs, Sheets, Calendar, or Gmail integrations.
---

# Google Auth Platform OAuth Setup

## Overview
Create or repair the Google-side setup before debugging app code. Use this skill when the real blocker is in Google Cloud Console rather than in local routes or token handling.

## Core Workflow
1. Identify the Google Cloud project that owns the OAuth client.
2. Confirm `Google Auth Platform` is configured with an `External` audience unless a Workspace-only flow is intended.
3. Confirm the correct OAuth client type:
   - `Web application` for localhost callback routes
   - do not use service account credentials for personal Drive write flows
4. Confirm every required redirect URI exactly matches the app callback.
5. Confirm the downloaded client secret JSON matches the client ID used in local env.
6. Only after the Google-side setup is correct, move to localhost auth, test users, or API enablement skills.

## Redirect URI Rules
- Match scheme, host, port, and path exactly.
- For this repo, the expected callback is `http://localhost:3000/api/auth/google/callback`.
- Treat `localhost` and `127.0.0.1` as different.
- If a user changes the port, update Google Auth Platform before blaming app code.

## Repo Notes
- This repo stores OAuth settings in `.env.local`.
- The app starts auth from `app/api/auth/google/start/route.ts`.
- The callback route is `app/api/auth/google/callback/route.ts`.
- The client secret JSON the user downloads belongs in the workspace only as a local secret, never as a committed artifact.

## Read Next
- Read `references/api-list.md` when the user is not sure which Workspace APIs must be enabled.
- Use `$google-test-users-unverified-apps` for `access_denied` and tester-gating errors.
- Use `$google-oauth-localhost-flow` once the OAuth client exists and the problem shifts to login, callback, or token creation.
