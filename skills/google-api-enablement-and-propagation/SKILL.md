---
name: google-api-enablement-and-propagation
description: Enable the correct Google Workspace APIs and interpret propagation-delay failures after enablement. Use when Codex sees errors saying an API has not been used before, is disabled, or may take a few minutes to propagate after being enabled.
---

# Google Api Enablement And Propagation

## Overview
Use this skill when auth succeeded but API calls still fail because the wrong Google APIs are disabled, enabled in the wrong project, or still propagating.

## Workflow
1. Read the exact error and extract the project number or project ID if present.
2. Map the failing call to the specific API:
   - Drive list/create -> Drive API
   - Docs batchUpdate -> Google Docs API
   - Sheets values update -> Google Sheets API
   - Calendar events.list -> Google Calendar API
   - Gmail send -> Gmail API
3. Enable the missing API in the same Google Cloud project that owns the OAuth client.
4. Wait a few minutes before declaring the app still broken.
5. Retry the same narrow operation before doing a full end-to-end run.

## Repo Notes
- This repo already exposed a real failure mode: Drive write partially succeeded, but Docs API was disabled in the OAuth project.
- Use `app/api/google/workspace-test/route.ts` for narrow Drive/Docs/Sheets verification.

## Read Next
- Read `references/api-list.md` for the exact API-to-operation mapping.
- Use `$google-drive-docs-sheets-create`, `$google-calendar-ingest-debug`, or `$google-gmail-send-debug` after enablement is fixed.
