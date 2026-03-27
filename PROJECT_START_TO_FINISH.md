# Project Start-to-Finish Guide

## Purpose of This Document

This document explains how this project was built from start to finish so another engineer can recreate the same type of system with minimal guesswork.

It covers:

- the original product direction
- the technical decisions that changed during implementation
- the exact implementation sequence
- the Google setup required
- how the app works internally
- how the test data was created
- how email delivery was tested
- the side work that was created to support the project, including local Codex skills

This project ended as a deterministic Google Workspace briefing system. It does not use any external LLM at runtime.

---

## 1. Final Project Definition

The final project is a Next.js application that:

- reads a user’s Google Calendar for a target day
- finds the attached or linked Google Drive documents for each meeting
- extracts the text from those documents
- builds a structured morning briefing
- adds PM-style synthesis using deterministic rules
- optionally sends that briefing by email through Gmail

The system is designed for a project manager who wants a daily morning brief generated from their real calendar and meeting materials.

---

## 2. Original Direction vs Final Direction

### Original direction

The project initially assumed:

- Google Workspace data ingestion
- external LLM summarization
- email delivery

The first plan referenced a third-party model provider.

### Final direction

The project was intentionally simplified and hardened:

- no Fireworks API
- no in-app OpenAI or other model provider
- no runtime LLM dependency

Instead, the system now uses:

- deterministic document extraction
- rules-based meeting summarization
- rules-based PM synthesis
- Gmail for final delivery

This made the system easier to test, easier to operate, and less fragile.

---

## 3. What Was Built

The main functional pieces are:

- Google authentication
- Google Calendar integration
- Google Drive integration
- Google Docs and Sheets integration
- text extraction for meeting documents
- deterministic digest generation
- PM-style synthesis generation
- email rendering
- email sending
- testing utilities
- local Codex skills for Google Workspace troubleshooting and reuse

---

## 4. Core Files and Responsibilities

These are the files that matter most:

- [lib/briefing.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/briefing.ts)
  - top-level orchestration for generating and optionally sending a morning briefing

- [lib/digest.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/digest.ts)
  - deterministic digest generation
  - PM-style synthesis generation

- [lib/email.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/email.ts)
  - HTML and plain-text email rendering

- [lib/google-workspace.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-workspace.ts)
  - Google Calendar read/write
  - Google Drive read/write
  - Google Docs / Sheets related operations
  - Gmail send

- [lib/google-auth.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-auth.ts)
  - Google OAuth flow and token management

- [lib/types.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/types.ts)
  - shared TypeScript types for meeting and briefing payloads

- [app/api/cron/morning-briefing/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/cron/morning-briefing/route.ts)
  - API route that runs the briefing job

- [app/api/auth/google/start/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/start/route.ts)
  - starts OAuth login

- [app/api/auth/google/callback/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/callback/route.ts)
  - handles OAuth callback

- [app/api/auth/google/status/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/status/route.ts)
  - shows whether Google OAuth has completed

- [app/api/google/workspace-test/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/google/workspace-test/route.ts)
  - live workspace test endpoint used to prove Drive and Docs/Sheets write access

- [tests/email.test.ts](/Users/corally/Documents/codex/Workspace%20Manager/tests/email.test.ts)
  - email rendering tests

---

## 5. Prerequisites

To recreate this project, the next person needs:

- Node.js
- npm
- a Google Cloud project
- a Google account that owns or can access the target Calendar and Drive data
- permission to enable Google APIs in Google Cloud

This project was built locally in a Next.js workspace.

---

## 6. Initial Project Setup

### Step 1: Create the app

Set up a Next.js app with server-side API routes.

Install the dependencies used in this project:

- `next`
- `react`
- `react-dom`
- `googleapis`
- `pdf-parse`
- `zod`
- `tsx`
- `typescript`

### Step 2: Add scripts

The project uses these script patterns:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test tests/**/*.test.ts"
  }
}
```

### Step 3: Define env configuration

Create `.env.example` and `.env.local`.

Important runtime values include:

- `GOOGLE_AUTH_MODE`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_TOKENS_FILE`
- `CRON_SECRET`
- `BRIEFING_RECIPIENT_EMAIL`
- `GOOGLE_CALENDAR_ID`
- `APP_TIMEZONE`

---

## 7. First Attempt: Service Account

### Why it was attempted

The first instinct for a backend automation project is often a Google service account. That is reasonable for backend workflows where the service account owns the data or has delegated access.

### What worked

The service account was able to:

- read some shared Drive metadata
- inspect a shared folder

### What failed

The service account failed when trying to create Google Docs and Sheets in the user’s Drive context.

This failure showed up as:

- quota problems
- ownership/context mismatch for native Google files

### What this means for future recreations

If the next person is building against a personal Google account or a normal user-owned Drive, do not assume a service account will be sufficient for write operations.

Service account is only a good default if:

- the data lives in a Shared Drive
- or there is a proper Google Workspace delegated setup

Otherwise, use user OAuth.

---

## 8. Correct Authentication Strategy: User OAuth

This project was successfully completed using Google user OAuth.

### Why OAuth was required

The app needed to act as the real Google user in order to:

- create Google Docs
- create Google Sheets
- create Calendar events
- send Gmail messages

### Google Cloud setup steps

To recreate this:

1. Open Google Cloud Console.
2. Open or create a Google Cloud project.
3. Open Google Auth Platform.
4. Configure the consent screen.
5. Set user type to `External`.
6. Add the real Google account as a test user if the app is still in testing mode.
7. Create an OAuth 2.0 Client ID of type `Web application`.
8. Add this redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

### APIs that must be enabled

Enable these APIs:

- Google Drive API
- Google Docs API
- Google Sheets API
- Google Calendar API
- Gmail API

If Docs or Sheets API is not enabled, file creation will fail even if Drive access already works.

### App-side OAuth setup

The following pieces were built:

- route to start Google login
- route to handle callback
- local token storage file
- status endpoint to verify auth completion

The implementation lives in:

- [lib/google-auth.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/google-auth.ts)
- [app/api/auth/google/start/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/start/route.ts)
- [app/api/auth/google/callback/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/callback/route.ts)
- [app/api/auth/google/status/route.ts](/Users/corally/Documents/codex/Workspace%20Manager/app/api/auth/google/status/route.ts)

### OAuth scopes required

This project needed scopes for:

- Calendar read/write
- Drive access
- Gmail send
- Sheets access

If the next person changes scopes after initial login, the user must re-consent.

---

## 9. Google Workspace Integration Layer

Once auth was stable, the next step was to build the Google integration code.

### Responsibilities handled in `lib/google-workspace.ts`

This file is responsible for:

- creating authenticated Google clients
- reading events for a target day
- normalizing attendees
- finding attachments from event attachments and Drive links in descriptions
- reading Drive file metadata
- exporting Google Docs to text
- reading Google Sheets cell ranges into text
- downloading files such as PDFs
- sending email through Gmail

### Important design choice

One file centralizes Google Workspace operations. This makes debugging much easier because all Drive, Calendar, Gmail, Docs, and Sheets logic is in one place.

---

## 10. Document Extraction Strategy

The system needed to turn meeting materials into text that could be used for a briefing.

### Supported sources

The extraction layer handles:

- Google Docs
- Google Sheets
- PDFs

### How extraction works

- Google Docs are exported as plain text.
- Google Sheets are read as bounded cell ranges and formatted into readable rows.
- PDFs are downloaded and parsed into text.

### Important constraint

Extraction is intentionally bounded. This prevents huge documents from turning into unmanageable briefing payloads.

### Why this matters

Even without an LLM, the system still needs usable source text so the digest builder can reference real meeting context.

---

## 11. Building the Briefing Pipeline

The central execution flow is in [lib/briefing.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/briefing.ts).

### Step-by-step runtime flow

1. Receive a target date, or default to the current local date.
2. Read all calendar events for that date.
3. For each event:
   - collect title
   - collect start and end time
   - collect attendees
   - collect location
   - collect description
   - find attachments and Drive links
4. Extract text from the source documents.
5. Convert all gathered event context into a structured briefing payload.
6. Add PM-style synthesis.
7. If `dryRun` is false, render the email and send it through Gmail.

### Why `dryRun` matters

This project used `dryRun=true` extensively while testing so the full data flow could be verified without sending unwanted emails.

---

## 12. Removing the LLM Dependency

This is one of the most important architectural decisions in the project.

### What changed

The original plan assumed an AI summarization API. That was removed.

### What replaced it

The app now uses deterministic logic for:

- executive summary
- key meeting points
- prep notes
- risks
- action items
- PM synthesis

### Why this was better for this project

- fewer external dependencies
- easier testing
- easier reproduction
- lower operational cost
- more predictable outputs

For a recreated project, this is a strong baseline even if an LLM is added later.

---

## 13. Creating Live Test Assets in Google Drive

After authentication was fixed, live workspace assets were created to validate the system.

### Assets created

- 10 sample Google Docs
- 1 tracking Google Sheet

### Purpose of the docs

The docs were used to confirm:

- Google Docs creation works
- text extraction works
- the app can handle multiple files in one workspace folder

### Purpose of the tracker sheet

The sheet was used to store:

- document title
- Google document ID
- Google Docs link
- metadata fields such as category, status, score, and timestamp

### Why this matters for recreation

A good way to validate the integration is:

1. create several files
2. create a tracker sheet
3. store direct links in the sheet
4. confirm the app can read those files back

That proves the integration is not only authenticated but also operational.

---

## 14. Creating Calendar Test Data

To validate the real morning briefing flow, realistic project-manager meetings were created.

### Date range used

- March 30, 2026
- March 31, 2026
- April 1, 2026
- April 2, 2026
- April 3, 2026

### Structure of the test schedule

Each day had at least 3 meetings.

Each meeting had:

- a meaningful title
- a scheduled time
- attendees
- description
- location or meeting room
- a Google Docs primer attached

### Why this was done

This step was critical because the system needed real calendar data with attached source material, not just isolated Drive documents.

That made it possible to test the exact use case the project was supposed to solve.

---

## 15. Deterministic Digest Generation

The digest generation is implemented in [lib/digest.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/digest.ts).

### What the digest includes

Each generated briefing includes:

- `executiveSummary`
- `topActions`
- per-meeting summaries
- per-meeting key points
- per-meeting prep notes
- per-meeting risks
- per-meeting action items
- metadata notes

### How it is built

The digest uses:

- event descriptions
- attachment availability
- extracted text counts
- participant lists
- location information

It is intentionally deterministic rather than model-driven.

---

## 16. PM-Style Synthesis Layer

After the first digest worked, the briefing was extended with PM-style guidance.

### Meeting-level synthesis

Each meeting now includes:

- `recommendedTalkingPoints`
- `decisionsToDrive`
- `stakeholderSignals`

### Day-level synthesis

Each full briefing now includes:

- `dailyPriorities`
- `crossMeetingRisks`
- `stakeholderUpdateDraft`

### How it works

The app uses a rules-based meeting theme classifier based on:

- event title
- event description

From that theme, it generates targeted PM guidance for meetings such as:

- delivery planning
- design review
- stakeholder update
- risk review
- planning sessions

### Why this matters

This is what made the briefings operationally useful. The app stopped being only a calendar digest and became a project-manager prep tool.

---

## 17. Email Rendering

The email rendering is implemented in [lib/email.ts](/Users/corally/Documents/codex/Workspace%20Manager/lib/email.ts).

### Output formats

Two formats are produced:

- HTML
- plain text

### Why both formats matter

- HTML is useful for readable inbox presentation
- text is useful for mail compatibility and debugging

### What the email includes

- date
- executive summary
- top actions
- PM synthesis section
- per-meeting summaries
- per-meeting PM synthesis

---

## 18. Sending the Email

After dry-run verification, the app was tested with a real send through Gmail.

### How this was performed

The briefing function was executed with:

- target date set explicitly
- `dryRun: false`

### Result

The Gmail send succeeded and the system reported:

- `ok: true`
- `emailSent: true`

This confirmed that the full path worked:

- calendar read
- file extraction
- digest generation
- PM synthesis
- email rendering
- Gmail delivery

---

## 19. Testing and Verification Sequence

The project was validated in a deliberate order.

### Step-by-step validation order

1. Validate code structure locally.
2. Run type checking.
3. Run unit tests.
4. Verify OAuth status.
5. Verify Drive folder visibility.
6. Verify Docs and Sheets creation.
7. Verify Calendar event creation.
8. Run a dry-run briefing for a real date.
9. Inspect the payload.
10. Refine digest rules.
11. Send a real email.

### Commands used regularly

```bash
npm run dev
npm run typecheck
npm test
npm run build
```

### Why this validation order matters

It isolates failures cleanly:

- auth problems fail before file operations
- file problems fail before digest generation
- digest problems fail before email send

---

## 20. Known Implementation Lessons

These are the key lessons someone recreating the project should know.

### Lesson 1: Service accounts are not enough for this use case

If the target is a normal user-owned Google account, use OAuth.

### Lesson 2: API enablement matters per product

Drive access working does not mean Docs or Sheets will work.

### Lesson 3: Add test users for unverified apps

If the OAuth app is in testing mode, only approved test users can log in.

### Lesson 4: Re-consent is required when scopes change

If you upgrade from Calendar read-only to Calendar write access, the user must authorize again.

### Lesson 5: Realistic seed data is worth the effort

The project became much easier to validate once real meetings and real docs existed in Google Workspace.

---

## 21. Side Work: Local Codex Skills

This project also produced a local skill pack to make future Google Workspace work easier.

### Why the skill pack was created

Repeated Google setup and debugging steps were expensive to rediscover. To reduce that cost, a repo-local set of Codex skills was created.

### Where the skills live

The pack was created under:

- [skills](/Users/corally/Documents/codex/Workspace%20Manager/skills)

### What the skills cover

The local skills include focused documentation for:

- Google OAuth setup
- localhost OAuth flow
- unverified app test users
- API enablement
- Drive folder smoke tests
- Docs and Sheets creation
- sharing and permission issues
- Calendar ingest debugging
- Gmail send debugging
- service account vs OAuth decision-making
- localhost debugging
- project-specific Google Workspace context

### How the skills were created

The skill pack was created as repo-local Codex skills rather than global skills.

Each skill includes:

- `SKILL.md`
- `agents/openai.yaml`

The skills were designed to be:

- narrow
- reusable
- easier to trigger
- useful outside this one project

### Why they matter for recreation

If the next person needs to build a similar Google Workspace automation project, the skill pack provides a starting library of known workflows and troubleshooting guides.

### Important limitation

These are repo-local skills. They are not automatically global Codex skills unless copied or mirrored into `~/.codex/skills`.

---

## 22. Suggested Recreation Order for the Next Engineer

If someone wants to recreate this project from scratch, the cleanest order is:

1. Create the Next.js project.
2. Add the Google client libraries and TypeScript setup.
3. Build env configuration handling.
4. Implement Google OAuth first.
5. Add OAuth status and callback routes.
6. Enable the required Google APIs.
7. Build Drive and Calendar read access.
8. Add Docs, Sheets, and Gmail support.
9. Create a workspace test route.
10. Prove that file creation works.
11. Create realistic calendar events and meeting primers.
12. Build deterministic digest generation.
13. Add PM-style synthesis rules.
14. Add email rendering.
15. Test in dry-run mode.
16. Send a real test email.
17. Create local skills so future work is easier.

This order minimizes wasted effort and avoids building the digest layer before the Google foundation is stable.

---

## 23. Recommended Deliverables for a Recreated Version

If another person recreates this project, they should aim to produce:

- a working OAuth flow
- a documented env contract
- a workspace test route
- a deterministic digest builder
- a PM synthesis layer
- email rendering in HTML and text
- automated tests
- realistic seed data in Google Calendar and Drive
- a reconstruction guide like this one
- a skill pack or troubleshooting notes

---

## 24. Final Summary

This project was performed in the following real sequence:

1. define the product direction from the initial plan
2. scaffold the Next.js app
3. implement Google Workspace integration
4. attempt service account auth
5. discover service-account limitations for user-owned Docs/Sheets
6. migrate to user OAuth
7. enable the required Google APIs
8. validate live Google access
9. create sample Drive documents and a tracking sheet
10. create realistic project-manager calendar events with primer docs
11. build the deterministic morning briefing pipeline
12. remove external LLM dependence completely
13. add PM-style synthesis
14. test the full flow with dry runs
15. send a real email
16. create a repo-local skill pack for future reuse

The final result is a working Google Workspace briefing system that is reproducible, testable, and understandable without relying on hidden context.

