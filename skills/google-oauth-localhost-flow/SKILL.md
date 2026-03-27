---
name: google-oauth-localhost-flow
description: Run and debug localhost Google OAuth flows for apps that use callback routes and token files. Use when Codex needs to verify auth start routes, callback routes, token-file creation, redirect mismatches, or browser consent behavior for local Next.js or server apps.
---

# Google Oauth Localhost Flow

## Overview
Use this skill after the Google OAuth client already exists. Focus on start-route redirects, callback handling, token persistence, and whether the local app is actually authorized.

## Workflow
1. Confirm the app callback route path and local port.
2. Confirm `.env.local` contains client ID, client secret, redirect URI, and token file path.
3. Check the auth start route returns a redirect to Google.
4. Check the callback route exchanges the code and writes a token file.
5. Verify token presence before attempting Drive, Calendar, or Gmail operations.

## Localhost Rules
- Treat `localhost:3000` as the source of truth for this repo unless the user explicitly changed the port.
- Do not debug API create/list failures before confirming `.google-oauth-tokens.json` exists.
- If auth succeeded once but later fails, inspect token-file presence and route status before rotating secrets.

## Repo Notes
- Auth start route: `app/api/auth/google/start/route.ts`
- Auth callback route: `app/api/auth/google/callback/route.ts`
- Auth status route: `app/api/auth/google/status/route.ts`
- Token file: `.google-oauth-tokens.json`

## Read Next
- Use `$google-workspace-localhost-debug` if the server cannot bind, curl cannot reach localhost, or port assumptions are wrong.
- Use `$google-test-users-unverified-apps` if the user sees tester or verification errors instead of consent.
