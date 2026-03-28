# AI Chief of Staff

Next.js app that generates a morning briefing digest from Google Calendar + Drive context, can optionally use Fireworks for LLM synthesis, and can send the result through Gmail and Telegram. It also supports a Supabase-backed chief-of-staff agent that drafts prep/follow-up tasks, stores approval-gated actions, and exposes them through Telegram commands.

## What It Does

- Reads the user's primary Google Calendar for a target date
- Pulls supported context from event attachments and Drive links in event descriptions
- Builds a structured digest from the collected context using deterministic logic or optional Fireworks synthesis
- Renders deterministic HTML/text email output
- Sends the briefing through Gmail using the connected Google user
- Sends a compact Telegram briefing through a bot to a configured chat
- Accepts inbound Telegram webhook messages and answers meeting questions
- Stores agent tasks, action proposals, and meeting snapshots in Supabase
- Supports approval-gated `/approve`, `/reject`, `/tasks`, `/followups`, `/brief`, and `/agenda` commands in Telegram
- Exposes pre-meeting and post-meeting agent cron endpoints for proactive planning

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in the Google OAuth values plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
3. Choose synthesis mode with `BRIEFING_SYNTHESIS_MODE=deterministic` or `fireworks`
4. If Fireworks is enabled, fill in `FIREWORKS_API_KEY` and optionally override `FIREWORKS_MODEL`
5. Choose delivery channels with `BRIEFING_DELIVERY_CHANNELS=email`, `telegram`, or `email,telegram`
6. If Telegram is enabled, fill in `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
7. If you want inbound Telegram replies, set `TELEGRAM_WEBHOOK_SECRET`
8. If you want agent-created Google Docs or sheet tracker updates, fill in `AGENT_GOOGLE_DOC_FOLDER_ID` and/or `AGENT_GOOGLE_TRACKER_SPREADSHEET_ID`
9. Install dependencies with `npm install`
10. Start the app with `npm run dev`
11. Visit `http://localhost:3000/api/auth/google/start` once to connect your Google account

## Endpoints

- `GET /api/health`: simple health response
- `GET /api/auth/google/start`: begin Google OAuth
- `GET /api/auth/google/callback`: OAuth callback endpoint
- `GET /api/auth/google/status`: current auth status
- `GET /api/cron/morning-briefing`: run the briefing job
- `GET /api/cron/pre-meeting-agent`: build pre-meeting tasks, snapshots, and approval-gated proposals
- `GET /api/cron/post-meeting-agent`: build post-meeting tasks, snapshots, and approval-gated proposals
- `POST /api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`: receive inbound Telegram updates
- `GET /api/google/workspace-test?folderId=<folderId>`: inspect a Drive folder
- `POST /api/google/workspace-test`: create five test docs and one tracker sheet in a folder

The cron endpoint requires either:

- `Authorization: Bearer <CRON_SECRET>`
- or `x-cron-secret: <CRON_SECRET>`

Optional query params:

- `date=YYYY-MM-DD`: run the job for a specific local date
- `dryRun=true`: build the briefing but do not send email or Telegram messages

`/api/google/workspace-test` uses the same `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` protection.

## Notes

- The included `csiworkspace-52b8a0e998e2.json` file is treated as a local secret and is ignored by `.gitignore`.
- OAuth mode is the recommended default for personal Google accounts.
- OAuth tokens are stored in Supabase in production-oriented setups; `GOOGLE_OAUTH_TOKENS_FILE` is only used for one-time migration from an existing local token file.
- Service account mode is still available for Workspace/domain setups.
- Fireworks synthesis is optional; when it fails, the app falls back to the deterministic digest.
- Telegram delivery uses the standard Bot API and a single configured chat ID in v1.
- Inbound Telegram replies use a webhook path secret; register the webhook after deployment with:
  `curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<PUBLIC_BASE_URL>/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>"`
- Telegram follow-up memory is stored in Supabase when `telegram_chat_context` exists; without that table the bot still works, but follow-up date and meeting references stay single-turn.
- Agent tasks/proposals/snapshots are stored in Supabase. The agent sends a Telegram summary when it drafts new work, but email/doc/sheet actions stay pending until you approve them.
- Recommended Telegram commands once the webhook is live:
  - `/tasks`
  - `/followups`
  - `/approve <proposal_id>`
  - `/reject <proposal_id>`
  - `/brief <date>`
  - `/agenda <meeting title or date>`

## Supabase OAuth Migration

Create this table in Supabase:

```sql
create table if not exists public.google_oauth_tokens (
  storage_key text primary key,
  user_email text,
  tokens jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;
```

Then migrate the existing local OAuth token file once with:

```bash
npm run migrate:google-oauth:supabase
```

Create this table too if you want Telegram follow-up memory across messages:

```sql
create table if not exists public.telegram_chat_context (
  chat_id text primary key,
  last_target_date text,
  last_question text,
  last_intent text,
  last_meeting_title text,
  updated_at timestamptz not null default now()
);

alter table public.telegram_chat_context enable row level security;
```

Create these tables too if you want the proactive chief-of-staff agent:

```sql
create table if not exists public.agent_tasks (
  id text primary key,
  source_meeting_id text,
  title text not null,
  detail text not null,
  owner text,
  due_date text,
  status text not null,
  priority text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_tasks enable row level security;

create table if not exists public.action_proposals (
  id text primary key,
  kind text not null,
  status text not null,
  payload jsonb not null,
  source_meeting_id text,
  target_date text,
  title text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz,
  execution_error text
);

alter table public.action_proposals enable row level security;

create table if not exists public.meeting_snapshots (
  id text primary key,
  event_id text not null,
  local_date text not null,
  prep_brief jsonb,
  followup_brief jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meeting_snapshots enable row level security;
```
