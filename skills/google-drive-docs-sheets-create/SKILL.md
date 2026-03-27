---
name: google-drive-docs-sheets-create
description: Create Google Docs and Sheets, especially for smoke tests and folder write verification. Use when Codex needs to create test documents, tracker sheets, or debug why Drive can list a folder but Docs or Sheets creation/update still fails.
---

# Google Drive Docs Sheets Create

## Overview
Use this skill after confirming folder access. Focus on Google-native file creation, post-create content insertion, and the difference between Drive create success and Docs or Sheets API follow-up failures.

## Workflow
1. Confirm the auth context is a real user OAuth flow when writing into personal Drive.
2. Confirm the target folder is visible and writable.
3. Create the file through Drive first.
4. If content insertion fails, treat Docs and Sheets as separate API enablement checks.
5. If the first file appears but the batch fails, inspect partial success before retrying.

## Rules
- A successful Drive create does not prove Docs API or Sheets API is enabled.
- Personal Drive plus service accounts is a bad default for Docs and Sheets creation.
- Prefer one narrow write test before bulk creation.

## Repo Notes
- This repo already has a test route for bulk creation at `POST /api/google/workspace-test`.
- The current known failure mode is: one Drive document can appear, then Docs API fails because it was disabled in the OAuth project.

## Read Next
- Read `references/common-failures.md` for the fastest mapping from error text to next action.
- Use `$google-api-enablement-and-propagation` if the error says an API has not been used or is disabled.
- Use `$google-drive-sharing-and-permissions` if create fails because ownership or write access is wrong.
