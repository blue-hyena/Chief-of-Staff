---
name: google-workspace-localhost-debug
description: Debug localhost route reachability, local server startup, curl checks, and app-side Google auth route behavior. Use when Codex needs to diagnose why a local Next.js or server app cannot bind a port, cannot be reached on localhost, or serves the wrong response from auth and test endpoints.
---

# Google Workspace Localhost Debug

## Overview
Use this skill when the Google setup may be fine but the local app is not reachable or the expected auth routes are not behaving on localhost.

## Workflow
1. Confirm the server is actually running and which port it bound to.
2. Confirm the expected local routes respond:
   - `/api/auth/google/start`
   - `/api/auth/google/status`
   - `/api/google/workspace-test`
3. Distinguish browser-side issues from local bind or curl reachability issues.
4. Only after localhost is healthy, move back to OAuth or Drive debugging.

## Repo Notes
- This repo uses Next.js local routes and may be run through `npm run dev`.
- The workspace test route requires the cron secret header even locally.
- The app has already shown one environment-specific issue: sandboxed localhost can behave differently from unrestricted localhost.

## Read Next
- Use `$google-oauth-localhost-flow` once localhost route health is confirmed.
