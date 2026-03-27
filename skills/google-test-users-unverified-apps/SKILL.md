---
name: google-test-users-unverified-apps
description: Fix Google OAuth test-user and unverified-app blocks during local app testing. Use when Codex sees `access_denied`, app-not-verified warnings, tester approval gates, or Google messages saying the user must be added as a developer-approved tester.
---

# Google Test Users Unverified Apps

## Overview
Use this skill when Google-side audience and tester configuration block consent, even though the OAuth client and redirect URI look correct.

## Workflow
1. Confirm the app audience is `External` unless a Workspace-only rollout is intended.
2. If the app is in testing mode, add the Gmail account as a test user.
3. Explain that unverified warnings are normal for local testing.
4. Distinguish between:
   - warning page that can be bypassed with `Advanced`
   - hard `403 access_denied` because the user is not on the tester list
5. Re-run the localhost auth flow only after the test-user list is updated.

## Expected Messages
- `has not completed the Google verification process` often means testing mode is active.
- `can only be accessed by developer-approved testers` means the account is missing from the test-user list.
- `Go to <app> (unsafe)` is expected for local development and does not mean the OAuth client is broken.

## Repo Notes
- This repo uses OAuth mode for personal Google accounts.
- The current real user for testing has been `acecanacan@gmail.com`.
- The next step after fixing test users is usually to revisit `/api/auth/google/start`.

## Read Next
- Use `$google-auth-platform-oauth-setup` if the problem is client creation, redirect URIs, or consent configuration.
- Use `$google-oauth-localhost-flow` after tester access is fixed.
