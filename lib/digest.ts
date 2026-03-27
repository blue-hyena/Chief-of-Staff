import { getAppConfig } from "@/lib/config";
import { EventContext, BriefingPayload, MeetingBriefing } from "@/lib/types";

function buildEventCorpus(event: EventContext) {
  return [
    event.title,
    event.description,
    ...event.attachments.map((attachment) => attachment.title),
    ...event.attachments.map((attachment) => attachment.extractedText.slice(0, 600)),
  ]
    .join(" ")
    .toLowerCase();
}

function buildPrimaryEventCorpus(event: EventContext) {
  return [event.title, event.description].join(" ").toLowerCase();
}

function hasAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferMeetingTheme(event: EventContext) {
  const primaryCorpus = buildPrimaryEventCorpus(event);

  if (hasAnyKeyword(primaryCorpus, ["design", "ux", "ui"])) {
    return "design";
  }

  if (hasAnyKeyword(primaryCorpus, ["stakeholder", "executive", "board", "update"])) {
    return "stakeholder";
  }

  if (hasAnyKeyword(primaryCorpus, ["risk", "triage", "issue", "incident"])) {
    return "risk";
  }

  if (hasAnyKeyword(primaryCorpus, ["launch", "readiness", "implementation", "delivery"])) {
    return "delivery";
  }

  if (hasAnyKeyword(primaryCorpus, ["backlog", "planning", "kickoff", "sprint"])) {
    return "planning";
  }

  if (hasAnyKeyword(primaryCorpus, ["vendor", "partner", "customer"])) {
    return "external";
  }

  if (hasAnyKeyword(primaryCorpus, ["metrics", "retro", "retrospective"])) {
    return "review";
  }

  return "general";
}

function summarizeAttachmentAvailability(event: EventContext) {
  const extracted = event.attachments.filter(
    (attachment) => attachment.extractedChars > 0,
  );
  const failed = event.attachments.filter((attachment) => attachment.extractionError);

  if (event.attachments.length === 0) {
    return "No linked or attached source documents were found for this meeting.";
  }

  if (extracted.length === 0 && failed.length > 0) {
    return "Source documents were detected, but none could be fully extracted.";
  }

  if (extracted.length === event.attachments.length) {
    return `Collected context from ${extracted.length} source document${extracted.length === 1 ? "" : "s"}.`;
  }

  return `Collected context from ${extracted.length} source document${extracted.length === 1 ? "" : "s"}; ${failed.length} item${failed.length === 1 ? "" : "s"} had extraction issues.`;
}

function truncateSentence(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function buildMeetingSummary(event: EventContext) {
  const description = event.description
    ? truncateSentence(event.description, 220)
    : "No event description was provided.";
  const attachmentSummary = summarizeAttachmentAvailability(event);

  return `${description} ${attachmentSummary}`.trim();
}

function buildKeyPoints(event: EventContext) {
  const points: string[] = [];

  if (event.location) {
    points.push(`Location: ${event.location}`);
  }

  if (event.description) {
    points.push(`Description captured (${event.description.length} chars).`);
  } else {
    points.push("No event description captured.");
  }

  const extracted = event.attachments.filter(
    (attachment) => attachment.extractedChars > 0,
  );

  if (extracted.length > 0) {
    points.push(
      ...extracted
        .slice(0, 4)
        .map(
          (attachment) =>
            `${attachment.title} (${attachment.extractedChars} chars extracted)`,
        ),
    );
  } else {
    points.push("No extracted document text available.");
  }

  return points;
}

function buildPrepNotes(event: EventContext) {
  const participants = event.attendees
    .map((attendee) => attendee.name || attendee.email || "Unknown")
    .slice(0, 6);
  const notes = [
    participants.length > 0
      ? `Participants: ${participants.join(", ")}`
      : "No participants listed on the event.",
  ];

  if (event.attachments.length > 0) {
    notes.push(
      `Attachments or Drive links detected: ${event.attachments.length}. Review the raw digest if you want deeper synthesis in chat.`,
    );
  }

  return notes;
}

function buildRisks(event: EventContext) {
  const risks = event.attachments
    .filter((attachment) => attachment.extractionError)
    .map(
      (attachment) =>
        `${attachment.title}: ${attachment.extractionError as string}`,
    );

  if (!event.description && event.attachments.length === 0) {
    risks.push("Very little context is available for this meeting.");
  }

  return risks;
}

function buildActionItems(event: EventContext) {
  const actions = ["Review the event details before start time."];

  if (event.attachments.some((attachment) => attachment.extractedChars > 0)) {
    actions.push("Read the extracted source material in the raw digest.");
  }

  if (event.attendees.length > 0) {
    actions.push("Confirm attendee roles and desired meeting outcome.");
  }

  return actions;
}

function buildMeetingPmSynthesis(event: EventContext) {
  const theme = inferMeetingTheme(event);
  const talkingPoints = [
    "Open by confirming the desired outcome, the decision needed, and the owner for follow-through.",
    "Close by restating owners, deadlines, and the exact next artifact or update expected after the meeting.",
  ];
  const decisionsToDrive = [
    "Lock the next step, explicit owner, and target date before the meeting ends.",
  ];
  const stakeholderSignals = [
    "Watch for ambiguity around ownership, sequencing, or approval expectations.",
  ];

  if (theme === "planning") {
    talkingPoints.splice(
      1,
      0,
      "Pressure-test scope, sequencing, and dependencies so the week starts with a realistic plan.",
    );
    decisionsToDrive.push("Confirm the priority order and any work that should be deferred.");
    stakeholderSignals.push("Flag any mismatch between planned scope and current team capacity.");
  } else if (theme === "delivery") {
    talkingPoints.splice(
      1,
      0,
      "Focus discussion on milestone readiness, blockers, and what must be true for the next delivery checkpoint.",
    );
    decisionsToDrive.push("Decide whether the current timeline still holds or needs an explicit adjustment.");
    stakeholderSignals.push("Escalate quickly if approvals or dependencies put a milestone at risk.");
  } else if (theme === "design") {
    talkingPoints.splice(
      1,
      0,
      "Drive toward concrete design decisions that unblock execution rather than open-ended feedback.",
    );
    decisionsToDrive.push("Get clear approval or a bounded revision plan for the open design items.");
    stakeholderSignals.push("Note any unresolved UX decision that could stall engineering or copy downstream.");
  } else if (theme === "risk") {
    talkingPoints.splice(
      1,
      0,
      "Keep the discussion anchored on severity, mitigation owner, and the deadline for the next update.",
    );
    decisionsToDrive.push("Agree on mitigation owners and what escalation threshold triggers leadership visibility.");
    stakeholderSignals.push("Surface any risk that lacks a named owner or a credible mitigation path.");
  } else if (theme === "stakeholder") {
    talkingPoints.splice(
      1,
      0,
      "Shape the narrative around status, risks, decisions, and the asks that need stakeholder support.",
    );
    decisionsToDrive.push("Decide what message, risk framing, and asks should be carried into the update.");
    stakeholderSignals.push("Watch for gaps between internal reality and the story that will be told upward.");
  } else if (theme === "external") {
    talkingPoints.splice(
      1,
      0,
      "Clarify commitments, dependencies, and the exact handoff between your team and the outside party.",
    );
    decisionsToDrive.push("Document the external commitment and internal owner for the follow-up.");
    stakeholderSignals.push("Call out any vendor or partner dependency that could slip without active tracking.");
  } else if (theme === "review") {
    talkingPoints.splice(
      1,
      0,
      "Separate signal from noise by focusing on what the metrics or review actually require the team to change.",
    );
    decisionsToDrive.push("Choose the one or two changes that should follow from the review.");
    stakeholderSignals.push("Avoid reporting metrics without attaching them to an operational response.");
  } else {
    talkingPoints.splice(
      1,
      0,
      "Use the meeting to turn background context into a concrete decision, commitment, or next deliverable.",
    );
    decisionsToDrive.push("Confirm how progress will be measured before the next check-in.");
    stakeholderSignals.push("Track any vague outcome that will need follow-up clarification after the meeting.");
  }

  if (event.attendees.length > 0) {
    const keyParticipants = event.attendees
      .map((attendee) => attendee.name || attendee.email || "Unknown")
      .slice(0, 2)
      .join(" and ");
    stakeholderSignals.push(`Make sure ${keyParticipants} leave with aligned expectations on outcome and timing.`);
  }

  return {
    recommendedTalkingPoints: talkingPoints,
    decisionsToDrive,
    stakeholderSignals,
  };
}

function toMeetingBriefing(event: EventContext): MeetingBriefing {
  return {
    eventId: event.eventId,
    title: event.title,
    start: event.start,
    end: event.end,
    participants: event.attendees.map(
      (attendee) => attendee.name || attendee.email || "Unknown",
    ),
    summary: buildMeetingSummary(event),
    keyPoints: buildKeyPoints(event),
    prepNotes: buildPrepNotes(event),
    risks: buildRisks(event),
    actionItems: buildActionItems(event),
    sourceReferences: event.attachments.map((attachment) => attachment.title),
    pmSynthesis: buildMeetingPmSynthesis(event),
  };
}

function buildDailyPmSynthesis(meetingContexts: EventContext[]) {
  if (meetingContexts.length === 0) {
    return {
      dailyPriorities: ["No meetings scheduled. Use the time to tighten plans, risks, and follow-ups."],
      crossMeetingRisks: ["No meeting-driven risks detected for the selected day."],
      stakeholderUpdateDraft: [
        "No meetings are scheduled today. Focus remains on async follow-through and preparation for upcoming decisions.",
      ],
    };
  }

  const firstMeeting = meetingContexts[0];
  const lastMeeting = meetingContexts[meetingContexts.length - 1];
  const themes = new Set(meetingContexts.map(inferMeetingTheme));
  const priorities = [
    `Start with ${firstMeeting.title} and use it to align the day’s operating plan early.`,
    "Capture owners and dates live during meetings so follow-through does not depend on memory afterward.",
    `End the day with a tight recap after ${lastMeeting.title}, especially on decisions, risks, and open asks.`,
  ];

  const crossMeetingRisks: string[] = [];

  if (themes.has("planning") && (themes.has("design") || themes.has("delivery"))) {
    crossMeetingRisks.push(
      "Plan quality may degrade if design or delivery constraints are still unsettled when commitments are made.",
    );
  }

  if (themes.has("stakeholder")) {
    crossMeetingRisks.push(
      "Stakeholder messaging can drift from ground truth unless risks and timeline confidence are tightened earlier in the day.",
    );
  }

  if (themes.has("risk")) {
    crossMeetingRisks.push(
      "A surfaced risk without a named mitigation owner will create churn across the rest of the schedule.",
    );
  }

  if (crossMeetingRisks.length === 0) {
    crossMeetingRisks.push(
      "Main operational risk is soft ownership or unclear next steps carrying from one meeting into the next.",
    );
  }

  const stakeholderUpdateDraft = [
    `Today’s focus is ${meetingContexts.map((meeting) => meeting.title).join(", ")}.`,
    "Primary PM goal is to leave each meeting with clear owners, dates, and a tighter narrative on priorities and risk.",
    themes.has("stakeholder")
      ? "Expect to convert internal discussion into a stakeholder-ready status update before end of day."
      : "If any plan, scope, or timing assumptions move today, prepare a concise downstream update immediately.",
  ];

  return {
    dailyPriorities: priorities,
    crossMeetingRisks,
    stakeholderUpdateDraft,
  };
}

export function buildDeterministicDigest(
  targetDate: string,
  meetingContexts: EventContext[],
): BriefingPayload {
  const config = getAppConfig();
  const meetings = meetingContexts.map(toMeetingBriefing);
  const withContext = meetingContexts.filter(
    (event) =>
      Boolean(event.description) ||
      event.attachments.some((attachment) => attachment.extractedChars > 0),
  ).length;
  const extractionIssues = meetingContexts.flatMap((event) =>
    event.attachments.filter((attachment) => attachment.extractionError),
  ).length;

  const executiveSummary =
    meetingContexts.length === 0
      ? "No meetings are scheduled for the selected day."
      : `${meetingContexts.length} meeting${meetingContexts.length === 1 ? "" : "s"} scheduled. ${withContext} meeting${withContext === 1 ? "" : "s"} include usable supporting context.`;

  const topActions =
    meetingContexts.length === 0
      ? ["No calendar events found for the selected date."]
      : [
          "Review the meeting list and identify which items need manual synthesis in chat.",
          "Open the extracted source documents for the highest-stakes meetings first.",
          extractionIssues > 0
            ? `Resolve ${extractionIssues} document extraction issue${extractionIssues === 1 ? "" : "s"} if those documents matter.`
            : "No document extraction issues were detected.",
        ];

  return {
    date: targetDate,
    executiveSummary,
    topActions,
    meetings,
    pmSynthesis: buildDailyPmSynthesis(meetingContexts),
    metadata: {
      calendarId: config.googleCalendarId,
      timezone: config.timezone,
      generatedAt: new Date().toISOString(),
      notes: [
        "Synthesis mode: deterministic.",
      ],
    },
  };
}
