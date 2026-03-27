---
name: google-drive-folder-smoke-test
description: Verify Google Drive folder visibility, ownership, child listing, and basic access assumptions. Use when Codex needs a quick yes/no answer on whether a Drive folder is reachable, empty, shared correctly, or visible to the current auth context.
---

# Google Drive Folder Smoke Test

## Overview
Use this skill for narrow folder checks before deeper debugging. Confirm metadata, child listing, and whether the problem is access, emptiness, or write behavior.

## Workflow
1. Resolve the folder ID from the shared URL.
2. Fetch folder metadata first.
3. List immediate children before assuming the folder is empty or broken.
4. Distinguish:
   - folder not found
   - folder visible but empty
   - folder visible but files hidden by auth context
   - folder readable but not writable
5. Only after a clean smoke test, move to Docs/Sheets creation or permission debugging.

## Repo Notes
- This repo exposes a folder-read endpoint at `GET /api/google/workspace-test?folderId=<folderId>`.
- The current test folder has been `1D-LedSBZbKwttt7xr9tqR39dA16d_ZGU`.

## Read Next
- Use `$google-drive-sharing-and-permissions` for ownership and sharing problems.
- Use `$google-drive-docs-sheets-create` if read access works and the next step is creation.
