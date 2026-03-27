---
name: google-gmail-send-debug
description: Debug Gmail API send flows, sender identity, MIME generation, and scope issues. Use when Codex needs to diagnose why an app can authenticate with Google but still fails to send mail, sends from the wrong identity, or produces malformed Gmail API requests.
---

# Google Gmail Send Debug

## Overview
Use this skill after Google auth is already working. Focus on sender identity, scopes, raw MIME assembly, and Gmail API response behavior.

## Workflow
1. Confirm the auth context and intended sender identity.
2. Confirm the app has Gmail send scope.
3. Inspect the raw message creation path before blaming Google.
4. Distinguish auth failures from sender or MIME failures.
5. Retry a narrow send test before end-to-end briefing runs.

## Repo Notes
- Gmail sending is implemented in `sendEmail` in `lib/google-workspace.ts`.
- This repo uses `userId: "me"` and builds a raw multipart message.
- In OAuth mode, the sender should align with the authorized Google user rather than a service-account delegate.

## Read Next
- Use `$google-service-account-vs-user-oauth` if sender identity is wrong because the auth model is wrong.
