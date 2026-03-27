---
name: google-drive-sharing-and-permissions
description: Debug Google Drive sharing, ownership, editor rights, and auth-context mismatches. Use when Codex needs to explain why a folder is visible but not writable, why files appear under the wrong owner, or why service-account and user-OAuth behavior differ for the same Drive resource.
---

# Google Drive Sharing And Permissions

## Overview
Use this skill when raw folder access looks inconsistent. The main job is to decide whether the issue is sharing, ownership, auth context, or Drive model mismatch.

## Workflow
1. Identify the active auth context: personal OAuth user, service account, or delegated Workspace user.
2. Check whether the folder is in personal Drive or a Shared Drive.
3. Confirm whether the current auth context has viewer or editor rights.
4. Separate:
   - read-only access
   - folder editor but wrong owner for Google-native file creation
   - service account access that works for reads but is wrong for personal Drive writes
5. Only after ownership and editor assumptions are clear, retry creation.

## Decision Rules
- Personal Gmail Drive plus service account is usually the wrong write model.
- Shared Drive plus service account is the clean backend path.
- Personal Gmail Drive plus user OAuth is the clean app path.

## Repo Notes
- This repo moved toward OAuth because the service account could read the folder but hit quota or ownership problems during write attempts.
- Use `$google-service-account-vs-user-oauth` if the user is deciding architecture rather than debugging a specific permission failure.

## Read Next
- Use `$google-drive-folder-smoke-test` for a narrow visibility check.
- Use `$google-drive-docs-sheets-create` once sharing and ownership are correct.
