# Project Start-to-Finish Guide

## Purpose

This document explains what this project became, how it evolved, and how another engineer could rebuild the same system with fewer false starts.

It covers:

- the current final architecture
- the major implementation phases
- the key technical decisions
- the storage and deployment model
- the main runtime routes and modules
- the current limitations

## 1. Final Project Definition

The final system is a Next.js-based chief-of-staff assistant that:

- reads Google Calendar events for a target date
- gathers linked and attached Google Drive context
- extracts text from Docs, Sheets, PDFs, and text files
- builds a daily briefing with deterministic logic or Fireworks
- sends that briefing through Gmail and/or Telegram
- answers meeting questions in Telegram
- stores memory and state in Supabase
- drafts pre-meeting and post-meeting tasks, snapshots, and approval-gated actions

This is no longer just a deterministic email briefing app. It is now a small agentic system with durable state and a Telegram control surface.

## 2. How the Project Evolved

### Phase 1: Morning briefing foundation

The initial goal was a daily briefing generated from Google Calendar and meeting materials.

This phase established:

- Next.js API routes
- Google Calendar reads
- Drive-based attachment discovery
- document text extraction
- deterministic briefing generation
- Gmail delivery

### Phase 2: Telegram delivery

The project expanded from email-only delivery to multi-channel delivery.

This phase added:

- Telegram bot token and chat ID configuration
- a Telegram renderer for compact briefing output
- delivery orchestration so email and Telegram could both be attempted independently

### Phase 3: Fireworks synthesis

The system then moved from deterministic-only synthesis to optional LLM-assisted synthesis.

This phase added:

- Fireworks-based briefing synthesis
- schema-constrained output validation
- deterministic fallback on failure

### Phase 4: Inbound Telegram assistant

The Telegram bot became interactive.

This phase added:

- webhook handling
- meeting-aware Q&A
- natural-language date parsing
- short conversation memory

### Phase 5: Durable serverless storage

The early OAuth flow depended on local token files, which is not production-safe on Vercel.

This phase moved runtime state into Supabase:

- Google OAuth tokens
- Telegram chat context

### Phase 6: Proactive agent layer

The system grew from an assistant into a lightweight agent.

This phase added:

- pre-meeting planning
- post-meeting planning
- Supabase-backed tasks
- approval-gated proposals
- Telegram commands for review and approval

## 3. Final Architecture

### Frontend shell

- [app/page.tsx](/Users/corally/Documents/codex/Workspace%20Manager/app/page.tsx)

This is a lightweight status page. It is not the main user interface. The real interaction surface is Telegram plus API routes.

### Config and environment

- [lib/config.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/config.ts)
- [.env.example](/Users/corally/Documents/codex/Workspace%20Manager/.env.example)

This layer parses all runtime configuration, including:

- Google OAuth
- Supabase
- Fireworks
- Telegram
- delivery channels
- agent-specific options

### Google auth and workspace integration

- [lib/google-auth.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-auth.ts)
- [lib/google-oauth-store.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-oauth-store.ts)
- [lib/google-workspace.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-workspace.ts)

This layer is responsible for:

- Google OAuth
- reading/writing durable OAuth state in Supabase
- Calendar reads
- Drive metadata and file extraction
- Gmail sends
- Google Docs creation
- Google Sheets updates

### Synthesis layer

- [lib/digest.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/digest.ts)
- [lib/fireworks.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/fireworks.ts)
- [lib/synthesis.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/synthesis.ts)

This layer selects between:

- deterministic digest generation
- Fireworks-based synthesis

It also preserves fallback behavior so the app still works when Fireworks is unavailable or returns malformed output.

### Delivery layer

- [lib/email.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/email.ts)
- [lib/telegram.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/telegram.ts)
- [lib/delivery.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/delivery.ts)

This layer handles:

- HTML/plain-text email rendering
- Telegram briefing rendering
- per-channel delivery
- partial-success behavior

### Telegram assistant layer

- [lib/telegram-assistant.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/telegram-assistant.ts)
- [lib/telegram-chat-context-store.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/telegram-chat-context-store.ts)

This layer handles:

- inbound Telegram webhook questions
- date parsing
- meeting Q&A
- follow-up memory
- Telegram command handling

Current commands include:

- `/tasks`
- `/followups`
- `/approve <proposal_id>`
- `/reject <proposal_id>`
- `/brief <date>`
- `/agenda <meeting title or date>`

### Agent layer

- [lib/agent.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/agent.ts)
- [lib/agent-planner.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/agent-planner.ts)
- [lib/agent-executor.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/agent-executor.ts)
- [lib/agent-store.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/agent-store.ts)

This layer turns meetings into:

- prep snapshots
- follow-up snapshots
- tasks
- approval-gated proposals

It also supports execution of approved proposals.

## 4. Runtime Routes

### OAuth

- [app/api/auth/google/start/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/start/route.ts)
- [app/api/auth/google/callback/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/callback/route.ts)
- [app/api/auth/google/status/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/status/route.ts)

### System status

- [app/api/health/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/health/route.ts)

### Morning briefing

- [app/api/cron/morning-briefing/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/cron/morning-briefing/route.ts)

### Agent planning

- [app/api/cron/pre-meeting-agent/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/cron/pre-meeting-agent/route.ts)
- [app/api/cron/post-meeting-agent/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/cron/post-meeting-agent/route.ts)

### Telegram webhook

- [app/api/telegram/webhook/[secret]/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/telegram/webhook/%5Bsecret%5D/route.ts)

### Google workspace test helper

- [app/api/google/workspace-test/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/google/workspace-test/route.ts)

## 5. Data and Storage Model

The final system stores runtime state in Supabase.

### Required durable tables

- `google_oauth_tokens`
- `telegram_chat_context`
- `agent_tasks`
- `action_proposals`
- `meeting_snapshots`

### Why this matters

This is the main production hardening change. The app no longer depends on local filesystem token storage for deployed runtime behavior.

## 6. Scheduling and Deployment

The system is intended to run on Vercel.

- [vercel.json](/Users/corally/Documents/codex/Workspace%20Manager/vercel.json)

Current repo-level schedule:

- morning briefing once per day via Vercel Cron

The pre-meeting and post-meeting routes exist, but more frequent scheduling is constrained by the Vercel plan. On Hobby, those routes still need manual triggering or an external scheduler if you want more than one run per day.

## 7. Key Technical Decisions

### Use user OAuth, not service account, for primary runtime

This project needs to act as the actual user for Gmail sends and Google-native file creation. Service account support still exists, but OAuth is the primary path.

### Store runtime state in Supabase

This removed the biggest serverless deployment weakness.

### Keep deterministic fallback paths

Fireworks improves quality, but the system should not fail closed when the model is unavailable or produces invalid output.

### Keep agent actions approval-gated

The project is intentionally not fully autonomous. It drafts tasks and actions, but the user approves execution.

## 8. What the System Can Do Today

- generate a daily morning briefing
- deliver it to Gmail and Telegram
- answer Telegram questions about meetings
- remember short chat context
- draft prep/follow-up tasks
- draft follow-up proposals
- execute approved proposals

## 9. Current Gaps

- manual task creation from Telegram is not implemented yet
- follow-up understanding is stronger for meeting/date context than for abstract references like “those proposals”
- pre/post-meeting scheduling is not fully automated under Hobby plan constraints
- the bot is meeting-focused, not a general-purpose assistant

## 10. Rebuild Checklist

If another engineer wanted to recreate this project cleanly, the order should be:

1. Set up Next.js app and typed config
2. Implement Google OAuth
3. Move token storage to Supabase immediately
4. Build Google Calendar + Drive extraction
5. Add deterministic briefing generation
6. Add Gmail delivery
7. Add Telegram delivery
8. Add Fireworks synthesis with schema validation and fallback
9. Add Telegram webhook and Q&A
10. Add chat memory
11. Add agent tasks/proposals/snapshots
12. Add approval workflow
13. Add Vercel cron schedule

This order avoids the earlier dead end of relying on local runtime files for deployed auth state.
