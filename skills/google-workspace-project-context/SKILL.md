---
name: google-workspace-project-context
description: Load the Google-specific routes, env vars, and known debugging context from this repo before working on its Google Workspace integration. Use when Codex is about to debug or extend this project’s auth, Drive, Docs, Sheets, Calendar, Gmail, or workspace-test flows and needs the repo-specific context fast.
---

# Google Workspace Project Context

## Overview
Use this skill as the repo-local anchor for the rest of the Google pack. Start here when the task is clearly about this codebase rather than generic Google setup.

## What To Read
- Read `references/repo-notes.md` first.
- Then jump to the narrow skill that matches the failure mode:
  - OAuth client or callback setup -> `$google-auth-platform-oauth-setup`
  - localhost auth run -> `$google-oauth-localhost-flow`
  - tester gating -> `$google-test-users-unverified-apps`
  - disabled API errors -> `$google-api-enablement-and-propagation`
  - folder visibility -> `$google-drive-folder-smoke-test`
  - document or sheet creation -> `$google-drive-docs-sheets-create`
  - sharing or ownership mismatch -> `$google-drive-sharing-and-permissions`
  - calendar ingest -> `$google-calendar-ingest-debug`
  - Gmail send -> `$google-gmail-send-debug`

## Rule
Do not duplicate the entire repo walkthrough in every skill. Keep this skill as the project-local entrypoint and let the narrow skills stay narrow.
