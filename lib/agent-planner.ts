import crypto from "node:crypto";
import { z } from "zod";
import { getAppConfig } from "@/lib/config";
import { buildDeterministicDigest } from "@/lib/digest";
import { createFireworksChatCompletion } from "@/lib/fireworks";
import {
  ActionProposal,
  AgentTask,
  EventContext,
  MeetingFollowupSnapshot,
  MeetingPrepSnapshot,
  MeetingSnapshot,
} from "@/lib/types";

const PlannerTaskSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  owner: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

const FireworksPrepMeetingSchema = z.object({
  eventId: z.string().min(1),
  prepBrief: z.string().min(1),
  agenda: z.array(z.string()),
  risks: z.array(z.string()),
  decisionsToDrive: z.array(z.string()),
  stakeholderSignals: z.array(z.string()),
  tasks: z.array(PlannerTaskSchema),
  confidence: z.enum(["high", "medium", "low"]),
});

const FireworksFollowupMeetingSchema = z.object({
  eventId: z.string().min(1),
  followupBrief: z.string().min(1),
  recapPoints: z.array(z.string()),
  nextSteps: z.array(z.string()),
  tasks: z.array(PlannerTaskSchema),
  draftEmailSubject: z.string().min(1),
  draftEmailBody: z.string().min(1),
  draftDocTitle: z.string().min(1),
  draftDocBody: z.string().min(1),
  trackerSummary: z.string().min(1),
  needsNotes: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

const FireworksPrepPlanSchema = z.object({
  meetings: z.array(FireworksPrepMeetingSchema),
});

const FireworksFollowupPlanSchema = z.object({
  meetings: z.array(FireworksFollowupMeetingSchema),
});

type AgentPlanResult = {
  snapshots: MeetingSnapshot[];
  tasks: AgentTask[];
  proposals: ActionProposal[];
  usedFallback: boolean;
};

type AgentPlannerDependencies = {
  createFireworksChatCompletion?: typeof createFireworksChatCompletion;
  now?: () => Date;
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeList(values: string[], fallback: string, limit = 5) {
  const cleaned = values.map((value) => compactText(value)).filter(Boolean);
  return cleaned.length > 0 ? cleaned.slice(0, limit) : [fallback];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stableId(parts: string[]) {
  return parts.join(":").replace(/[^a-zA-Z0-9:_-]+/g, "-");
}

function buildPromptPayload(targetDate: string, meetingContexts: EventContext[]) {
  return {
    targetDate,
    meetings: meetingContexts.map((event) => ({
      eventId: event.eventId,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location ?? null,
      description: event.description || null,
      participants: event.attendees.map(
        (attendee) => attendee.name || attendee.email || "Unknown",
      ),
      attachments: event.attachments.slice(0, 2).map((attachment) => ({
        title: attachment.title,
        mimeType: attachment.mimeType,
        extractionError: attachment.extractionError ?? null,
        extractedTextSnippet: attachment.extractedText.slice(0, 1200).trim(),
      })),
    })),
  };
}

function makeTask(
  meeting: EventContext,
  phase: "pre" | "post",
  index: number,
  task: {
    title: string;
    detail: string;
    owner?: string | null;
    dueDate?: string | null;
    priority?: "low" | "medium" | "high";
  },
  now: Date,
): AgentTask {
  return {
    id: stableId([meeting.eventId, phase, "task", String(index + 1)]),
    sourceMeetingId: meeting.eventId,
    title: compactText(task.title),
    detail: compactText(task.detail),
    owner: task.owner ?? undefined,
    dueDate: task.dueDate ?? undefined,
    status: "pending",
    priority: task.priority ?? "medium",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function buildPrepDocBody(meeting: EventContext, snapshot: MeetingPrepSnapshot) {
  return [
    `Meeting: ${meeting.title}`,
    `Date: ${meeting.start}`,
    "",
    snapshot.brief,
    "",
    "Agenda",
    ...snapshot.agenda.map((item) => `- ${item}`),
    "",
    "Risks",
    ...snapshot.risks.map((item) => `- ${item}`),
    "",
    "Decisions to Drive",
    ...snapshot.decisionsToDrive.map((item) => `- ${item}`),
  ].join("\n");
}

function buildFollowupDocBody(meeting: EventContext, snapshot: MeetingFollowupSnapshot) {
  return [
    `Meeting: ${meeting.title}`,
    `Date: ${meeting.start}`,
    "",
    snapshot.brief,
    "",
    "Recap Points",
    ...snapshot.recapPoints.map((item) => `- ${item}`),
    "",
    "Next Steps",
    ...snapshot.nextSteps.map((item) => `- ${item}`),
    "",
    snapshot.needsNotes
      ? "Confidence is low because this recap is inferred from meeting context rather than actual notes."
      : "Confidence is supported by the available meeting context.",
  ].join("\n");
}

function buildEmailHtml(text: string) {
  return `<html><body style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(
    text,
  )}</body></html>`;
}

function buildPrepTelegramMessage(
  meeting: EventContext,
  snapshot: MeetingPrepSnapshot,
  timezone: string,
) {
  return [
    `Prep nudge: ${meeting.title} at ${new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(meeting.start))}`,
    "",
    snapshot.brief,
    "",
    "Key points:",
    ...snapshot.agenda.slice(0, 2).map((item) => `- ${item}`),
    ...snapshot.risks.slice(0, 2).map((item) => `- Risk: ${item}`),
  ].join("\n");
}

function buildPostTelegramMessage(
  meeting: EventContext,
  snapshot: MeetingFollowupSnapshot,
) {
  return [
    `Follow-up pack ready for ${meeting.title}.`,
    "",
    snapshot.brief,
    "",
    "Key points:",
    ...snapshot.nextSteps.slice(0, 3).map((item) => `- ${item}`),
    ...(snapshot.needsNotes
      ? ["- Confidence is low; add meeting notes before sending follow-ups."]
      : []),
  ].join("\n");
}

function buildPrepProposals(
  targetDate: string,
  meeting: EventContext,
  snapshot: MeetingPrepSnapshot,
  now: Date,
) {
  const config = getAppConfig();
  const proposals: ActionProposal[] = [
    {
      id: stableId([meeting.eventId, "pre", "proposal", "send_telegram_message"]),
      kind: "send_telegram_message",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Send prep nudge for ${meeting.title}`,
      summary: "Share the pre-meeting prep pack in Telegram.",
      payload: {
        chatId: config.telegram?.chatId,
        message: buildPrepTelegramMessage(meeting, snapshot, config.timezone),
        summary: "Telegram prep reminder",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  if (config.agent.googleDocFolderId) {
    proposals.push({
      id: stableId([meeting.eventId, "pre", "proposal", "create_google_doc"]),
      kind: "create_google_doc",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Create prep doc for ${meeting.title}`,
      summary: "Create a Google Doc with agenda, risks, and decisions.",
      payload: {
        folderId: config.agent.googleDocFolderId,
        title: `Prep - ${meeting.title} - ${targetDate}`,
        body: buildPrepDocBody(meeting, snapshot),
        summary: "Prep document draft",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  if (config.agent.googleTrackerSpreadsheetId) {
    proposals.push({
      id: stableId([meeting.eventId, "pre", "proposal", "update_google_sheet"]),
      kind: "update_google_sheet",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Update prep tracker for ${meeting.title}`,
      summary: "Add prep status to the meeting tracker sheet.",
      payload: {
        spreadsheetId: config.agent.googleTrackerSpreadsheetId,
        rows: [[targetDate, meeting.title, "prep", snapshot.confidence, snapshot.risks[0] ?? ""]],
        summary: "Prep tracker row",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return proposals;
}

function buildFollowupProposals(
  targetDate: string,
  meeting: EventContext,
  snapshot: MeetingFollowupSnapshot,
  nextSteps: string[],
  now: Date,
) {
  const config = getAppConfig();
  const recipients = meeting.attendees
    .map((attendee) => attendee.email)
    .filter((value): value is string => Boolean(value));
  const followupText = [
    `Follow-up for ${meeting.title}`,
    "",
    snapshot.brief,
    "",
    "Next steps:",
    ...nextSteps.map((item) => `- ${item}`),
    ...(snapshot.needsNotes
      ? ["", "Confidence note: this draft is inferred from meeting context and should be reviewed before sending."]
      : []),
  ].join("\n");
  const proposals: ActionProposal[] = [];

  if (recipients.length > 0) {
    proposals.push({
      id: stableId([meeting.eventId, "post", "proposal", "send_email"]),
      kind: "send_email",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Send follow-up email for ${meeting.title}`,
      summary: "Draft and send the meeting follow-up email to attendees.",
      payload: {
        to: recipients,
        subject: `Follow-up: ${meeting.title}`,
        text: followupText,
        html: buildEmailHtml(followupText),
        summary: "Meeting follow-up email",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  proposals.push({
    id: stableId([meeting.eventId, "post", "proposal", "send_telegram_message"]),
    kind: "send_telegram_message",
    status: "pending",
    sourceMeetingId: meeting.eventId,
    targetDate,
    title: `Send follow-up Telegram summary for ${meeting.title}`,
    summary: "Share the follow-up pack in Telegram.",
    payload: {
      chatId: config.telegram?.chatId,
      message: buildPostTelegramMessage(meeting, snapshot),
      summary: "Telegram follow-up summary",
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  if (config.agent.googleDocFolderId) {
    proposals.push({
      id: stableId([meeting.eventId, "post", "proposal", "create_google_doc"]),
      kind: "create_google_doc",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Create follow-up doc for ${meeting.title}`,
      summary: "Create a Google Doc with recap and next steps.",
      payload: {
        folderId: config.agent.googleDocFolderId,
        title: `Follow-up - ${meeting.title} - ${targetDate}`,
        body: buildFollowupDocBody(meeting, snapshot),
        summary: "Follow-up document draft",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  if (config.agent.googleTrackerSpreadsheetId) {
    proposals.push({
      id: stableId([meeting.eventId, "post", "proposal", "update_google_sheet"]),
      kind: "update_google_sheet",
      status: "pending",
      sourceMeetingId: meeting.eventId,
      targetDate,
      title: `Update follow-up tracker for ${meeting.title}`,
      summary: "Add follow-up status to the meeting tracker sheet.",
      payload: {
        spreadsheetId: config.agent.googleTrackerSpreadsheetId,
        rows: [[targetDate, meeting.title, "followup", snapshot.confidence, nextSteps[0] ?? ""]],
        summary: "Follow-up tracker row",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return proposals;
}

function buildDeterministicPrepPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  now: Date,
): AgentPlanResult {
  const digest = buildDeterministicDigest(targetDate, meetingContexts);
  const tasks: AgentTask[] = [];
  const proposals: ActionProposal[] = [];
  const snapshots = meetingContexts.map((meeting) => {
    const meetingBrief = digest.meetings.find((item) => item.eventId === meeting.eventId);
    const prepSnapshot: MeetingPrepSnapshot = {
      brief:
        meetingBrief?.summary ??
        compactText(meeting.description || "Review the agenda and confirm the desired outcome."),
      agenda: sanitizeList(
        meetingBrief?.keyPoints ?? [],
        "Confirm the meeting objective, blockers, and owner decisions.",
      ),
      risks: sanitizeList(
        meetingBrief?.risks ?? [],
        "Limited context; confirm risks live with attendees.",
      ),
      decisionsToDrive: sanitizeList(
        meetingBrief?.pmSynthesis.decisionsToDrive ?? [],
        "Lock the next step, owner, and deadline before the meeting ends.",
      ),
      stakeholderSignals: sanitizeList(
        meetingBrief?.pmSynthesis.stakeholderSignals ?? [],
        "Watch for ambiguity around ownership, timing, or approvals.",
      ),
      confidence: meeting.attachments.length > 0 ? "medium" : "low",
    };

    const prepTasks = sanitizeList(
      meetingBrief?.prepNotes ?? [],
      "Review the meeting context and confirm the decision needed.",
      3,
    ).map((item, index) =>
      makeTask(
        meeting,
        "pre",
        index,
        {
          title: `Prep for ${meeting.title}`,
          detail: item,
          dueDate: meeting.start,
          priority: index === 0 ? "high" : "medium",
        },
        now,
      ),
    );

    tasks.push(...prepTasks);
    proposals.push(...buildPrepProposals(targetDate, meeting, prepSnapshot, now));

    return {
      id: stableId([meeting.eventId, targetDate]),
      eventId: meeting.eventId,
      localDate: targetDate,
      prepBrief: prepSnapshot,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies MeetingSnapshot;
  });

  return {
    snapshots,
    tasks,
    proposals,
    usedFallback: false,
  };
}

function buildDeterministicFollowupPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  now: Date,
): AgentPlanResult {
  const digest = buildDeterministicDigest(targetDate, meetingContexts);
  const tasks: AgentTask[] = [];
  const proposals: ActionProposal[] = [];
  const snapshots = meetingContexts.map((meeting) => {
    const meetingBrief = digest.meetings.find((item) => item.eventId === meeting.eventId);
    const nextSteps = sanitizeList(
      meetingBrief?.actionItems ?? [],
      "Review the meeting outcome and convert the next step into an assigned action.",
    );
    const followupSnapshot: MeetingFollowupSnapshot = {
      brief:
        compactText(meetingBrief?.summary ?? meeting.description) ||
        "No meeting notes were captured. Review the meeting context before sending follow-ups.",
      recapPoints: sanitizeList(
        meetingBrief?.keyPoints ?? [],
        "No recap points are available from meeting notes.",
      ),
      nextSteps,
      needsNotes: true,
      confidence: "low",
    };
    const followupTasks = nextSteps.slice(0, 3).map((item, index) =>
      makeTask(
        meeting,
        "post",
        index,
        {
          title: `Follow up on ${meeting.title}`,
          detail: item,
          dueDate: targetDate,
          priority: index === 0 ? "high" : "medium",
        },
        now,
      ),
    );

    tasks.push(...followupTasks);
    proposals.push(
      ...buildFollowupProposals(targetDate, meeting, followupSnapshot, nextSteps, now),
    );

    return {
      id: stableId([meeting.eventId, targetDate]),
      eventId: meeting.eventId,
      localDate: targetDate,
      followupBrief: followupSnapshot,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies MeetingSnapshot;
  });

  return {
    snapshots,
    tasks,
    proposals,
    usedFallback: false,
  };
}

async function buildFireworksPrepPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  dependencies: AgentPlannerDependencies,
  now: Date,
): Promise<AgentPlanResult> {
  const config = getAppConfig();
  const content = await (
    dependencies.createFireworksChatCompletion ?? createFireworksChatCompletion
  )({
    apiKey: config.fireworks!.apiKey,
    model: config.fireworks!.model,
    timeoutMs: config.fireworks!.timeoutMs,
    temperature: 0.2,
    maxTokens: 2600,
    responseFormat: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content:
          "You are a proactive chief of staff planning meeting preparation. Return only valid JSON. Base every answer on the provided meeting context, stay concise, and never invent event IDs.",
      },
      {
        role: "user",
        content: [
          "Return JSON with this shape:",
          '{ "meetings": [{ "eventId": string, "prepBrief": string, "agenda": string[], "risks": string[], "decisionsToDrive": string[], "stakeholderSignals": string[], "tasks": [{ "title": string, "detail": string, "owner": string | null, "dueDate": string | null, "priority": "low" | "medium" | "high" }], "confidence": "high" | "medium" | "low" }] }',
          "Return one entry for every eventId. Keep tasks action-oriented and prep-specific.",
          "",
          JSON.stringify(buildPromptPayload(targetDate, meetingContexts), null, 2),
        ].join("\n"),
      },
    ],
  });
  const structured = FireworksPrepPlanSchema.parse(JSON.parse(content));
  const tasks: AgentTask[] = [];
  const proposals: ActionProposal[] = [];
  const snapshots = meetingContexts.map((meeting) => {
    const planned = structured.meetings.find((item) => item.eventId === meeting.eventId);

    if (!planned) {
      throw new Error(`Fireworks omitted prep planning for ${meeting.eventId}`);
    }

    const snapshot: MeetingPrepSnapshot = {
      brief: compactText(planned.prepBrief),
      agenda: sanitizeList(planned.agenda, "Confirm the objective, blockers, and owner."),
      risks: sanitizeList(planned.risks, "No major prep risks were surfaced."),
      decisionsToDrive: sanitizeList(
        planned.decisionsToDrive,
        "Confirm next step, owner, and deadline.",
      ),
      stakeholderSignals: sanitizeList(
        planned.stakeholderSignals,
        "Watch for ambiguity around approvals or sequencing.",
      ),
      confidence: planned.confidence,
    };

    tasks.push(
      ...planned.tasks.map((task, index) =>
        makeTask(meeting, "pre", index, task, now),
      ),
    );
    proposals.push(...buildPrepProposals(targetDate, meeting, snapshot, now));

    return {
      id: stableId([meeting.eventId, targetDate]),
      eventId: meeting.eventId,
      localDate: targetDate,
      prepBrief: snapshot,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies MeetingSnapshot;
  });

  return {
    snapshots,
    tasks,
    proposals,
    usedFallback: false,
  };
}

async function buildFireworksFollowupPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  dependencies: AgentPlannerDependencies,
  now: Date,
): Promise<AgentPlanResult> {
  const config = getAppConfig();
  const content = await (
    dependencies.createFireworksChatCompletion ?? createFireworksChatCompletion
  )({
    apiKey: config.fireworks!.apiKey,
    model: config.fireworks!.model,
    timeoutMs: config.fireworks!.timeoutMs,
    temperature: 0.2,
    maxTokens: 3200,
    responseFormat: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content:
          "You are a proactive chief of staff drafting post-meeting follow-up packs. Return only valid JSON. If actual outcomes are not visible from the source material, mark needsNotes=true and confidence=low. Do not fabricate decisions.",
      },
      {
        role: "user",
        content: [
          "Return JSON with this shape:",
          '{ "meetings": [{ "eventId": string, "followupBrief": string, "recapPoints": string[], "nextSteps": string[], "tasks": [{ "title": string, "detail": string, "owner": string | null, "dueDate": string | null, "priority": "low" | "medium" | "high" }], "draftEmailSubject": string, "draftEmailBody": string, "draftDocTitle": string, "draftDocBody": string, "trackerSummary": string, "needsNotes": boolean, "confidence": "high" | "medium" | "low" }] }',
          "Return one entry per eventId. Be explicit when the recap is inferred rather than observed.",
          "",
          JSON.stringify(buildPromptPayload(targetDate, meetingContexts), null, 2),
        ].join("\n"),
      },
    ],
  });
  const structured = FireworksFollowupPlanSchema.parse(JSON.parse(content));
  const tasks: AgentTask[] = [];
  const proposals: ActionProposal[] = [];
  const snapshots = meetingContexts.map((meeting) => {
    const planned = structured.meetings.find((item) => item.eventId === meeting.eventId);

    if (!planned) {
      throw new Error(`Fireworks omitted follow-up planning for ${meeting.eventId}`);
    }

    const snapshot: MeetingFollowupSnapshot = {
      brief: compactText(planned.followupBrief),
      recapPoints: sanitizeList(
        planned.recapPoints,
        "No recap points were available from observed notes.",
      ),
      nextSteps: sanitizeList(
        planned.nextSteps,
        "Confirm the next step and owner before sending a follow-up.",
      ),
      needsNotes: planned.needsNotes,
      confidence: planned.confidence,
    };

    tasks.push(
      ...planned.tasks.map((task, index) =>
        makeTask(meeting, "post", index, task, now),
      ),
    );

    const followupProposals = buildFollowupProposals(
      targetDate,
      meeting,
      snapshot,
      snapshot.nextSteps,
      now,
    ).map((proposal) => {
      if (proposal.kind === "send_email") {
        return {
          ...proposal,
          payload: {
            ...proposal.payload,
            subject: planned.draftEmailSubject,
            text: planned.draftEmailBody,
            html: buildEmailHtml(planned.draftEmailBody),
          },
        } satisfies ActionProposal;
      }

      if (proposal.kind === "create_google_doc") {
        return {
          ...proposal,
          payload: {
            ...proposal.payload,
            title: planned.draftDocTitle,
            body: planned.draftDocBody,
          },
        } satisfies ActionProposal;
      }

      if (proposal.kind === "update_google_sheet") {
        return {
          ...proposal,
          payload: {
            ...proposal.payload,
            rows: [[targetDate, meeting.title, "followup", snapshot.confidence, planned.trackerSummary]],
          },
        } satisfies ActionProposal;
      }

      return proposal;
    });

    proposals.push(...followupProposals);

    return {
      id: stableId([meeting.eventId, targetDate]),
      eventId: meeting.eventId,
      localDate: targetDate,
      followupBrief: snapshot,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies MeetingSnapshot;
  });

  return {
    snapshots,
    tasks,
    proposals,
    usedFallback: false,
  };
}

export async function buildPreMeetingPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  dependencies: AgentPlannerDependencies = {},
): Promise<AgentPlanResult> {
  const config = getAppConfig();
  const now = dependencies.now?.() ?? new Date();

  if (meetingContexts.length === 0) {
    return {
      snapshots: [],
      tasks: [],
      proposals: [],
      usedFallback: false,
    };
  }

  if (config.briefingSynthesisMode !== "fireworks" || !config.fireworks) {
    return buildDeterministicPrepPlans(targetDate, meetingContexts, now);
  }

  try {
    return await buildFireworksPrepPlans(targetDate, meetingContexts, dependencies, now);
  } catch {
    const fallback = buildDeterministicPrepPlans(targetDate, meetingContexts, now);
    return {
      ...fallback,
      usedFallback: true,
    };
  }
}

export async function buildPostMeetingPlans(
  targetDate: string,
  meetingContexts: EventContext[],
  dependencies: AgentPlannerDependencies = {},
): Promise<AgentPlanResult> {
  const config = getAppConfig();
  const now = dependencies.now?.() ?? new Date();

  if (meetingContexts.length === 0) {
    return {
      snapshots: [],
      tasks: [],
      proposals: [],
      usedFallback: false,
    };
  }

  if (config.briefingSynthesisMode !== "fireworks" || !config.fireworks) {
    return buildDeterministicFollowupPlans(targetDate, meetingContexts, now);
  }

  try {
    return await buildFireworksFollowupPlans(targetDate, meetingContexts, dependencies, now);
  } catch {
    const fallback = buildDeterministicFollowupPlans(targetDate, meetingContexts, now);
    return {
      ...fallback,
      usedFallback: true,
    };
  }
}
