import { BriefingPayload, EventContext } from "@/lib/types";

export const eventContextFixture: EventContext = {
  eventId: "evt-1",
  title: "Board Prep",
  description: "Finalize the talking points and funding posture for the upcoming board call.",
  location: "Zoom",
  htmlLink: "https://calendar.google.com/event?eid=evt-1",
  start: "2026-03-25T01:00:00.000Z",
  end: "2026-03-25T02:00:00.000Z",
  attendees: [
    {
      name: "Alex",
      email: "alex@example.com",
      responseStatus: "accepted",
    },
    {
      name: "Jamie",
      email: "jamie@example.com",
      responseStatus: "accepted",
    },
  ],
  attachments: [
    {
      id: "doc-1",
      title: "Board Memo",
      mimeType: "application/vnd.google-apps.document",
      source: "calendar_attachment",
      extractedText:
        "Q2 revenue is tracking slightly ahead of plan, but stakeholder alignment on the funding narrative remains soft.",
      extractedChars: 113,
    },
  ],
};

export const briefingPayloadFixture: BriefingPayload = {
  date: "2026-03-25",
  executiveSummary: "A heavy strategy day with two high-context meetings.",
  topActions: ["Review Q2 asks.", "Clarify ownership before the board call."],
  meetings: [
    {
      eventId: eventContextFixture.eventId,
      title: eventContextFixture.title,
      start: eventContextFixture.start,
      end: eventContextFixture.end,
      participants: ["Alex", "Jamie"],
      summary: "Finalize the talking points and funding posture.",
      keyPoints: ["Budget is tight.", "Need a cleaner narrative."],
      prepNotes: ["Bring last quarter performance numbers."],
      risks: ["Stakeholder alignment is still weak."],
      actionItems: ["Draft opening remarks."],
      sourceReferences: ["Board Memo"],
      pmSynthesis: {
        recommendedTalkingPoints: ["Open with the board narrative and the funding ask."],
        decisionsToDrive: ["Lock the funding posture and next review date."],
        stakeholderSignals: ["Watch for misalignment between the narrative and actual risk."],
      },
    },
  ],
  pmSynthesis: {
    dailyPriorities: ["Tighten narrative before the board call."],
    crossMeetingRisks: ["Board messaging may overstate confidence."],
    stakeholderUpdateDraft: ["Status is stable, but the funding narrative needs sharper framing."],
  },
  metadata: {
    calendarId: "primary",
    timezone: "Asia/Manila",
    generatedAt: "2026-03-24T21:00:00.000Z",
    notes: [],
  },
};
