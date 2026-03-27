# AI Chief of Staff: Automated Morning Briefing Workflow

## Overview
This project is an agentic AI workflow designed to act as an automated associate portfolio manager and digital Chief of Staff. It eliminates morning friction by pre-processing the day's cognitive load. By integrating with Google Workspace, the system analyzes scheduled meetings, reads attached documents, synthesizes the context, and delivers a highly actionable, strategic morning briefing directly to the user's inbox before the day begins.

## Core Features
* **Automated Context Gathering:** Seamlessly pulls daily events from Google Calendar based on a scheduled trigger.
* **Deep Document Parsing:** Extracts and reads attachments (Docs, Sheets, PDFs) from Google Drive that are linked within calendar events.
* **Intelligent Synthesis:** Utilizes an LLM to analyze raw meeting descriptions and document text, transforming messy data into a coherent, strategic briefing.
* **Action-Oriented Delivery:** Sends a perfectly formatted email outlining the day's agenda, key participants, synthesized document summaries, and specific action items or mental prep needed.

## Architecture & Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js | Handles the core logic, API routes, and the webhook/cron infrastructure. |
| **Digest Engine** | Deterministic app logic + optional Fireworks synthesis | Organizes extracted meeting and document context into a structured briefing digest for manual review or delivery. |
| **Integrations** | Google Workspace APIs | Accesses Calendar (scheduling), Drive (document extraction), and Gmail (dispatch). |
| **Automation** | Cron Jobs | Triggers the ingestion and synthesis pipeline daily at a specified time (e.g., 5:00 AM). |

## The "Why"
This workflow is built on the philosophy of proactive preparation—the digital equivalent of laying out your running clothes the night before. By automating the extraction of meeting context and document review, it allows the user to wake up and immediately focus on execution, negotiation, and strategy rather than administrative catch-up.

---
*Maintained by: Corally Into*
