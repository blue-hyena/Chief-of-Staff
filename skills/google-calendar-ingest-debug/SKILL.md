---
name: google-calendar-ingest-debug
description: Debug Google Calendar event ingestion, time windows, missing meetings, and attachment discovery. Use when Codex needs to explain why expected events are not returned, why the wrong day is queried, or why calendar-linked documents are missing from a local ingestion flow.
---

# Google Calendar Ingest Debug

## Overview
Use this skill to isolate whether missing context is caused by Calendar query windows, calendar selection, event shape, or downstream attachment extraction.

## Workflow
1. Confirm the calendar ID being queried.
2. Confirm the local date and timezone are converted to the intended UTC window.
3. Inspect whether events are all-day or timed events.
4. Check whether attachments come from event attachments, description links, or both.
5. Distinguish missing events from missing attached context.

## Repo Notes
- The repo computes date windows in `lib/time.ts`.
- Calendar reads happen in `listEventContextsForDate` inside `lib/google-workspace.ts`.
- The app defaults to `primary` calendar and a configured app timezone.

## Read Next
- Use `$google-drive-folder-smoke-test` or `$google-drive-docs-sheets-create` if the calendar event is present but the linked Drive context is the missing piece.
