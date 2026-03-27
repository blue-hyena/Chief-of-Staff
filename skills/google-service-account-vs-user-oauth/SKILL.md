---
name: google-service-account-vs-user-oauth
description: Choose the correct Google auth model for an app before implementing more code. Use when Codex needs to decide between user OAuth, service accounts, Shared Drives, or Workspace delegation for Google Drive, Docs, Sheets, Calendar, and Gmail workflows.
---

# Google Service Account Vs User Oauth

## Overview
Use this skill when the user’s architecture choice is the real problem. Prefer deciding the auth model once instead of repeatedly debugging symptoms from the wrong model.

## Decision Rules
- Personal Gmail Drive or Gmail send -> prefer user OAuth.
- Shared Drive backend automation -> prefer service account.
- Workspace mailbox impersonation -> prefer domain-wide delegation.
- If the user says “no browser login” and also wants personal Drive writes, call out that the requirement is not feasible.

## Repo Notes
- This repo started with service-account assumptions, then shifted to user OAuth for personal Google account access.
- The current local app supports both modes in config, but OAuth is the recommended default.

## Read Next
- Use `$google-auth-platform-oauth-setup` when the decision is user OAuth.
- Use `$google-drive-sharing-and-permissions` when the auth model is already chosen and the issue is narrower.
