# AI Chief of Staff: System Description

## Overview

AI Chief of Staff is a Next.js application that turns a user’s Google Calendar and linked meeting materials into an operational assistant. It combines:

- daily briefing generation
- Gmail and Telegram delivery
- a Telegram-based meeting assistant
- Supabase-backed memory and state
- Fireworks-backed synthesis and planning
- approval-gated agent actions

The system is designed to reduce the operational overhead around meetings: understanding the day’s schedule, reading supporting materials, drafting prep and follow-up items, and surfacing those outputs in a single chat interface.

## What the System Does

- Reads a target day’s events from Google Calendar
- Pulls linked or attached Google Drive materials from those meetings
- Extracts usable text from Docs, Sheets, PDFs, and text files
- Builds a daily morning briefing using deterministic logic or Fireworks synthesis
- Delivers that briefing through Gmail and/or Telegram
- Accepts inbound Telegram messages and answers meeting-related questions
- Stores short-term chat context so follow-up questions are more coherent
- Drafts pre-meeting and post-meeting tasks, snapshots, and approval-gated proposals
- Lets the user inspect and approve pending agent actions through Telegram

## Core User Experience

The system has three primary surfaces:

### 1. Morning briefing

The app can run a protected cron-style route to generate a morning briefing for the local date and deliver it through configured channels.

### 2. Telegram assistant

The Telegram bot can answer questions such as:

- What are my meetings next Wednesday?
- Who is in the Board Prep meeting?
- What could slip if these meetings go badly?
- /brief 2026-03-31
- /tasks
- /followups

### 3. Proactive agent

The app can build pre-meeting and post-meeting plans, store them in Supabase, and expose them as:

- pending tasks
- meeting snapshots
- pending proposals that require approval before execution

## Architecture

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| App framework | Next.js | API routes, webhook handling, cron endpoints, status page |
| State store | Supabase | OAuth token storage, chat memory, tasks, proposals, meeting snapshots |
| Google integrations | Google Workspace APIs | Calendar read, Drive read, Gmail send, Docs create, Sheets update |
| Synthesis | Deterministic logic + optional Fireworks | Daily briefing generation, Telegram meeting answers, agent planning |
| Delivery | Gmail + Telegram Bot API | Outbound briefing and approved action execution |
| Scheduling | Vercel Cron | Daily production trigger for the morning briefing |

## Runtime Data Model

The system currently relies on these durable tables in Supabase:

- `google_oauth_tokens`
- `telegram_chat_context`
- `agent_tasks`
- `action_proposals`
- `meeting_snapshots`

This means the deployed app does not depend on a local token file or local chat memory.

## Action Model

The agent is intentionally human-in-the-loop.

It can draft actions such as:

- send a Telegram summary
- send a follow-up email
- create a Google Doc
- update a Google Sheet

But those are stored first as pending proposals. The user must approve them from Telegram before execution.

## Delivery and Scheduling

The repo currently includes a Vercel cron configuration for the morning briefing route:

- `/api/cron/morning-briefing`

The schedule is set in `vercel.json` and currently targets a daily morning run aligned to Manila time through a UTC cron expression.

## Why This Design

The system is built around practical operational leverage:

- structured daily briefings reduce morning context-loading
- Telegram offers a low-friction interface for quick questions and approvals
- Supabase provides durable state for serverless deployment
- Fireworks improves synthesis quality without making the system completely brittle because deterministic fallbacks still exist
- approval gates keep the agent useful without making it overly autonomous

---

Maintained by: Corally Into
