import { getAppConfig } from "@/lib/config";
import { buildDeterministicDigest } from "@/lib/digest";
import { createFireworksChatCompletion } from "@/lib/fireworks";
import { listEventContextsForDate } from "@/lib/google-workspace";
import {
  readTelegramChatContext,
  TelegramChatContext,
  writeTelegramChatContext,
} from "@/lib/telegram-chat-context-store";
import {
  addDaysToLocalDate,
  formatDisplayDate,
  formatLocalDateTime,
  getLocalDateString,
} from "@/lib/time";
import { sendTelegramText, TelegramUpdate } from "@/lib/telegram";
import { EventContext } from "@/lib/types";

const TELEGRAM_ASSISTANT_ATTACHMENT_LIMIT = 2;
const TELEGRAM_ASSISTANT_ATTACHMENT_TEXT_LIMIT = 900;
const MONTH_LOOKUP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const WEEKDAY_LOOKUP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const TITLE_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "for",
  "with",
  "to",
  "of",
  "my",
  "meeting",
  "call",
  "review",
  "sync",
]);
const MEETING_KEYWORDS = [
  "meeting",
  "meetings",
  "calendar",
  "schedule",
  "agenda",
  "call",
  "sync",
  "standup",
  "review",
  "prep",
  "prepare",
  "risk",
  "risks",
  "attendees",
  "participant",
  "participants",
  "stakeholder",
  "blocker",
  "blockers",
  "priority",
  "priorities",
  "timeline",
  "slip",
  "dependencies",
  "dependency",
  "owners",
  "meeting title",
];
const FOLLOW_UP_MARKERS = [
  "these meetings",
  "those meetings",
  "that meeting",
  "that one",
  "this one",
  "what about",
  "how about",
  "them",
  "they",
  "it",
];

type TelegramAssistantDependencies = {
  createFireworksChatCompletion?: (
    options: Parameters<typeof createFireworksChatCompletion>[0],
  ) => Promise<string>;
  listEventContextsForDate?: (localDate: string) => Promise<EventContext[]>;
  now?: () => Date;
  sendTelegramText?: typeof sendTelegramText;
  readTelegramChatContext?: (
    chatId: number | string,
  ) => Promise<TelegramChatContext | null>;
  writeTelegramChatContext?: (
    context: TelegramChatContext,
  ) => Promise<void>;
  priorContext?: TelegramChatContext | null;
};

type TelegramQuestionFocus =
  | "summary"
  | "schedule"
  | "attendees"
  | "risks"
  | "prep"
  | "meeting";

type TelegramAssistantTurn = {
  text: string;
  contextUpdate?: Partial<TelegramChatContext>;
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAssistantReply(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeQuestion(text: string) {
  return text.replace(/^\/today\b/i, "Today").trim();
}

function isFollowUpQuestion(question: string) {
  const lower = question.toLowerCase();
  return FOLLOW_UP_MARKERS.some((marker) => lower.includes(marker));
}

function isAppreciationMessage(question: string) {
  return /\b(thank you|thanks|appreciate it|you are enough|you're enough|love you|good bot)\b/i.test(
    question,
  );
}

function isGreetingMessage(question: string) {
  return /\b(hi|hello|hey)\b/i.test(question.trim());
}

function inferQuestionFocus(question: string) {
  const lower = question.toLowerCase();

  if (
    lower.includes("what are my meetings") ||
    lower.includes("what meetings") ||
    lower.includes("what do i have") ||
    lower.includes("calendar") ||
    lower.includes("schedule") ||
    lower.includes("first meeting") ||
    lower.includes("last meeting")
  ) {
    return "schedule" satisfies TelegramQuestionFocus;
  }

  if (
    lower.includes("who is in") ||
    lower.includes("who's in") ||
    lower.includes("attendee") ||
    lower.includes("participants") ||
    lower.includes("who am i meeting")
  ) {
    return "attendees" satisfies TelegramQuestionFocus;
  }

  if (
    lower.includes("risk") ||
    lower.includes("blocker") ||
    lower.includes("concern") ||
    lower.includes("slip") ||
    lower.includes("go badly") ||
    lower.includes("go wrong")
  ) {
    return "risks" satisfies TelegramQuestionFocus;
  }

  if (
    lower.includes("prep") ||
    lower.includes("prepare") ||
    lower.includes("before each") ||
    lower.includes("what should i do")
  ) {
    return "prep" satisfies TelegramQuestionFocus;
  }

  if (
    lower.includes("when is") ||
    lower.includes("what time") ||
    lower.includes("where is") ||
    lower.includes("where's") ||
    lower.includes("who is") ||
    lower.includes("who's") ||
    lower.includes("tell me about") ||
    lower.includes("what is") ||
    lower.includes("what's")
  ) {
    return "meeting" satisfies TelegramQuestionFocus;
  }

  return "summary" satisfies TelegramQuestionFocus;
}

function formatYyyyMmDd(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
}

function getLocalDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
    weekday:
      parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "sunday",
  };
}

function parseMonthNameDate(text: string, timezone: string, now: Date) {
  const match = text.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?(?:\s+(\d{4}))?\b/i,
  );

  if (!match) {
    return null;
  }

  const month = MONTH_LOOKUP[match[1].toLowerCase()];
  const day = Number(match[2]);
  const currentParts = getLocalDateParts(now, timezone);
  const year = match[3] ? Number(match[3]) : currentParts.year;

  return formatYyyyMmDd(year, month, day);
}

function parseSlashDate(text: string, timezone: string, now: Date) {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const currentParts = getLocalDateParts(now, timezone);
  const rawYear = match[3];
  const year = !rawYear
    ? currentParts.year
    : rawYear.length === 2
      ? 2000 + Number(rawYear)
      : Number(rawYear);

  return formatYyyyMmDd(year, month, day);
}

function parseWeekdayDate(text: string, timezone: string, now: Date) {
  const match = text.match(
    /\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );

  if (!match) {
    return null;
  }

  const [, modifier, weekdayText] = match;
  const today = getLocalDateString(now, timezone);
  const currentWeekday = WEEKDAY_LOOKUP[getLocalDateParts(now, timezone).weekday];
  const targetWeekday = WEEKDAY_LOOKUP[weekdayText.toLowerCase()];
  let delta = (targetWeekday - currentWeekday + 7) % 7;

  if (modifier?.toLowerCase() === "next" && delta === 0) {
    delta = 7;
  }

  return addDaysToLocalDate(today, delta);
}

function hasExplicitDate(text: string, timezone: string, now: Date) {
  return Boolean(
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
      parseMonthNameDate(text, timezone, now) ||
      parseSlashDate(text, timezone, now) ||
      parseWeekdayDate(text, timezone, now) ||
      /\b(today|tomorrow|yesterday|day after tomorrow)\b/i.test(text),
  );
}

function isMeetingRelatedQuestion(
  question: string,
  priorContext: TelegramChatContext | null,
  timezone: string,
  now: Date,
) {
  if (hasExplicitDate(question, timezone, now)) {
    return true;
  }

  const lower = question.toLowerCase();

  if (MEETING_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return true;
  }

  if (priorContext?.lastMeetingTitle && lower.includes(priorContext.lastMeetingTitle.toLowerCase())) {
    return true;
  }

  if (priorContext?.lastTargetDate && isFollowUpQuestion(question)) {
    return true;
  }

  return false;
}

function resolveTargetDateFromQuestion(
  text: string,
  timezone: string,
  now: Date,
  priorContext: TelegramChatContext | null,
) {
  const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (explicitDate) {
    return explicitDate[1];
  }

  const monthNameDate = parseMonthNameDate(text, timezone, now);

  if (monthNameDate) {
    return monthNameDate;
  }

  const slashDate = parseSlashDate(text, timezone, now);

  if (slashDate) {
    return slashDate;
  }

  const weekdayDate = parseWeekdayDate(text, timezone, now);

  if (weekdayDate) {
    return weekdayDate;
  }

  const today = getLocalDateString(now, timezone);
  const lower = text.toLowerCase();
  const followUp = isFollowUpQuestion(text);
  const relativeBase = followUp && priorContext?.lastTargetDate ? priorContext.lastTargetDate : today;

  if (lower.includes("day after tomorrow")) {
    return addDaysToLocalDate(relativeBase, 2);
  }

  if (lower.includes("tomorrow")) {
    return addDaysToLocalDate(relativeBase, 1);
  }

  if (lower.includes("yesterday")) {
    return addDaysToLocalDate(relativeBase, -1);
  }

  if (lower.includes("today")) {
    return today;
  }

  if (priorContext?.lastTargetDate && followUp) {
    return priorContext.lastTargetDate;
  }

  return today;
}

function tokenizeTitle(title: string) {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token));
}

function findReferencedMeeting(
  question: string,
  meetingContexts: EventContext[],
  priorContext: TelegramChatContext | null,
) {
  const lower = question.toLowerCase();

  if (lower.includes("first meeting")) {
    return [...meetingContexts].sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  }

  if (lower.includes("last meeting")) {
    return [...meetingContexts].sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
  }

  for (const meeting of meetingContexts) {
    if (lower.includes(meeting.title.toLowerCase())) {
      return meeting;
    }
  }

  if (
    priorContext?.lastMeetingTitle &&
    isFollowUpQuestion(question) &&
    meetingContexts.some(
      (meeting) => meeting.title.toLowerCase() === priorContext.lastMeetingTitle?.toLowerCase(),
    )
  ) {
    return (
      meetingContexts.find(
        (meeting) => meeting.title.toLowerCase() === priorContext.lastMeetingTitle?.toLowerCase(),
      ) ?? null
    );
  }

  const scored = meetingContexts
    .map((meeting) => {
      const tokens = tokenizeTitle(meeting.title);
      const score = tokens.filter((token) => lower.includes(token)).length;

      return {
        meeting,
        score,
        tokenCount: tokens.length,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.tokenCount - a.tokenCount);

  const best = scored[0];

  if (!best) {
    return null;
  }

  if (best.score >= 2 || best.tokenCount === 1) {
    return best.meeting;
  }

  return null;
}

function buildMeetingContextPayload(meetingContexts: EventContext[]) {
  return meetingContexts.map((event) => ({
    eventId: event.eventId,
    title: event.title,
    start: event.start,
    end: event.end,
    location: event.location ?? null,
    description: event.description || null,
    participants: event.attendees.map(
      (attendee) => attendee.name || attendee.email || "Unknown",
    ),
    attachments: event.attachments
      .slice(0, TELEGRAM_ASSISTANT_ATTACHMENT_LIMIT)
      .map((attachment) => ({
        title: attachment.title,
        mimeType: attachment.mimeType,
        extractionError: attachment.extractionError ?? null,
        extractedTextSnippet: attachment.extractedText
          .slice(0, TELEGRAM_ASSISTANT_ATTACHMENT_TEXT_LIMIT)
          .trim(),
      })),
  }));
}

function buildNoMeetingsReply(targetDate: string, timezone: string) {
  const displayDate = formatDisplayDate(targetDate, timezone);

  return [
    `I don't see any meetings on ${displayDate}.`,
    "",
    "Key points:",
    "- No calendar events were found for that date.",
    "- You can mention another date naturally, for example 'April 1, 2026' or 'next Wednesday'.",
    "- I can still help summarize another day or prep for a specific meeting title.",
  ].join("\n");
}

function buildNonMeetingReply(question: string) {
  if (isAppreciationMessage(question)) {
    return [
      "Glad to help.",
      "",
      "Key points:",
      "- I’m best at questions about your meetings, schedule, attendees, risks, and prep.",
      "- Try something like 'What are my meetings tomorrow?' or 'Who is in the Board Prep meeting?'",
    ].join("\n");
  }

  if (isGreetingMessage(question)) {
    return [
      "Hi. I can help with your meetings and calendar context.",
      "",
      "Key points:",
      "- Ask about a date, a meeting title, risks, prep, attendees, or timing.",
      "- Example: 'What are my meetings next Wednesday?'",
    ].join("\n");
  }

  return [
    "I’m focused on your meetings, calendar, and meeting prep.",
    "",
    "Key points:",
    "- Ask about a date, meeting title, timing, attendees, risks, or prep.",
    "- Example: 'What could slip if these meetings go badly?'",
    "- Example: 'Tell me about the Vendor Coordination Call.'",
  ].join("\n");
}

function formatParticipants(event: EventContext) {
  if (event.attendees.length === 0) {
    return "No attendees are listed.";
  }

  return event.attendees
    .map((attendee) => attendee.name || attendee.email || "Unknown attendee")
    .join(", ");
}

function buildScheduleReply(
  targetDate: string,
  timezone: string,
  meetingContexts: EventContext[],
) {
  const displayDate = formatDisplayDate(targetDate, timezone);
  const sorted = [...meetingContexts].sort((a, b) => a.start.localeCompare(b.start));

  return [
    `You have ${sorted.length} meeting${sorted.length === 1 ? "" : "s"} on ${displayDate}.`,
    "",
    "Key points:",
    ...sorted.slice(0, 5).map((meeting) => {
      const timeRange = `${formatLocalDateTime(meeting.start, timezone)} to ${formatLocalDateTime(
        meeting.end,
        timezone,
      )}`;
      return `- ${meeting.title} (${timeRange})`;
    }),
  ].join("\n");
}

function buildAttendeesReply(
  targetDate: string,
  timezone: string,
  meetingContexts: EventContext[],
  referencedMeeting: EventContext | null,
) {
  const displayDate = formatDisplayDate(targetDate, timezone);

  if (referencedMeeting) {
    return [
      `The attendees for ${referencedMeeting.title} on ${displayDate} are:`,
      "",
      "Key points:",
      `- ${formatParticipants(referencedMeeting)}`,
      `- Time: ${formatLocalDateTime(referencedMeeting.start, timezone)} to ${formatLocalDateTime(
        referencedMeeting.end,
        timezone,
      )}`,
      `- Location: ${referencedMeeting.location ?? "No location listed."}`,
    ].join("\n");
  }

  return [
    `Here’s who is on your ${displayDate} meetings.`,
    "",
    "Key points:",
    ...meetingContexts
      .slice(0, 5)
      .map((meeting) => `- ${meeting.title}: ${formatParticipants(meeting)}`),
  ].join("\n");
}

function buildMeetingDetailsReply(
  targetDate: string,
  timezone: string,
  referencedMeeting: EventContext | null,
) {
  if (!referencedMeeting) {
    return [
      `I can answer detailed questions about a specific meeting on ${formatDisplayDate(
        targetDate,
        timezone,
      )}, but I need the meeting title.`,
      "",
      "Key points:",
      "- Mention the meeting name, for example 'Tell me about the Board Prep meeting.'",
      "- I can answer about time, attendees, location, and the meeting’s main context.",
    ].join("\n");
  }

  const summary = compactText(
    referencedMeeting.description || "No detailed description is available for this meeting.",
  );
  const attachmentSummary =
    referencedMeeting.attachments[0]?.extractedText?.slice(0, 180).trim() ?? null;
  const lines = [
    `${referencedMeeting.title} is scheduled for ${formatLocalDateTime(
      referencedMeeting.start,
      timezone,
    )} to ${formatLocalDateTime(referencedMeeting.end, timezone)}.`,
    "",
    "Key points:",
    `- Location: ${referencedMeeting.location ?? "No location listed."}`,
    `- Attendees: ${formatParticipants(referencedMeeting)}`,
    `- Context: ${summary}`,
  ];

  if (attachmentSummary) {
    lines.push(`- Attachment note: ${compactText(attachmentSummary)}`);
  }

  return lines.join("\n");
}

function buildDeterministicAssistantReply(
  question: string,
  targetDate: string,
  timezone: string,
  meetingContexts: EventContext[],
  priorContext: TelegramChatContext | null,
) {
  if (meetingContexts.length === 0) {
    return buildNoMeetingsReply(targetDate, timezone);
  }

  const digest = buildDeterministicDigest(targetDate, meetingContexts);
  const displayDate = formatDisplayDate(targetDate, timezone);
  const focus = inferQuestionFocus(question);
  const referencedMeeting = findReferencedMeeting(question, meetingContexts, priorContext);

  if (focus === "schedule") {
    return buildScheduleReply(targetDate, timezone, meetingContexts);
  }

  if (focus === "attendees") {
    return buildAttendeesReply(targetDate, timezone, meetingContexts, referencedMeeting);
  }

  if (focus === "risks") {
    const meetingRisks = digest.meetings
      .flatMap((meeting) =>
        meeting.risks.slice(0, 1).map((risk) => `${meeting.title}: ${risk}`),
      )
      .slice(0, 3);
    const bullets = [...digest.pmSynthesis.crossMeetingRisks, ...meetingRisks].slice(0, 5);

    return [
      `The biggest risks on ${displayDate} are weak ownership, timeline drift, and unresolved dependencies carrying between meetings.`,
      "",
      "Key points:",
      ...bullets.map((item) => `- ${item}`),
    ].join("\n");
  }

  if (focus === "prep") {
    const prepBullets = [
      ...digest.topActions,
      ...digest.meetings.slice(0, 2).flatMap((meeting) =>
        meeting.prepNotes.slice(0, 1).map((note) => `${meeting.title}: ${note}`),
      ),
    ].slice(0, 5);

    return [
      `Before the ${displayDate} meetings, focus on confirming readiness, owners, and the decisions each session needs to produce.`,
      "",
      "Key points:",
      ...prepBullets.map((item) => `- ${item}`),
    ].join("\n");
  }

  if (focus === "meeting") {
    return buildMeetingDetailsReply(targetDate, timezone, referencedMeeting);
  }

  return [
    digest.executiveSummary,
    "",
    "Key points:",
    ...digest.topActions.slice(0, 5).map((item) => `- ${item}`),
  ].join("\n");
}

function buildCommandReply(text: string, targetDate: string, timezone: string) {
  const lower = text.trim().toLowerCase();

  if (lower.startsWith("/start")) {
    return [
      "I can answer questions about your meetings and related prep.",
      "",
      "Try messages like:",
      "- What are my meetings next Wednesday?",
      `- Summarize my ${targetDate} meetings in plain English.`,
      "- Who is in the Board Prep meeting?",
      "- What should I do before each meeting tomorrow?",
    ].join("\n");
  }

  if (lower.startsWith("/help")) {
    return [
      "Ask me about your meetings using natural language.",
      "",
      "Supported patterns:",
      "- month-name dates like April 1, 2026",
      "- relative dates like today, tomorrow, next Wednesday",
      "- schedules, attendees, risks, prep, and specific meetings",
      "",
      "Examples:",
      "- What are my meetings for April 1, 2026?",
      "- Who is in the Board Prep meeting?",
      "- What could slip if these meetings go badly?",
      "- Tell me about my last meeting tomorrow.",
    ].join("\n");
  }

  return null;
}

function buildContextUpdate(
  question: string,
  targetDate: string,
  focus: TelegramQuestionFocus,
  referencedMeeting: EventContext | null,
) {
  return {
    lastTargetDate: targetDate,
    lastQuestion: question,
    lastIntent: focus,
    lastMeetingTitle: referencedMeeting?.title,
  } satisfies Partial<TelegramChatContext>;
}

async function buildTelegramAssistantTurn(
  question: string,
  dependencies: TelegramAssistantDependencies = {},
): Promise<TelegramAssistantTurn> {
  const config = getAppConfig();
  const now = dependencies.now ?? (() => new Date());
  const priorContext = dependencies.priorContext ?? null;
  const sanitizedQuestion = sanitizeQuestion(question);
  const targetDate = resolveTargetDateFromQuestion(
    sanitizedQuestion,
    config.timezone,
    now(),
    priorContext,
  );
  const commandReply = buildCommandReply(sanitizedQuestion, targetDate, config.timezone);

  if (commandReply) {
    return {
      text: commandReply,
      contextUpdate: {
        lastTargetDate: targetDate,
        lastQuestion: sanitizedQuestion,
        lastIntent: "command",
      },
    };
  }

  if (!isMeetingRelatedQuestion(sanitizedQuestion, priorContext, config.timezone, now())) {
    return {
      text: buildNonMeetingReply(sanitizedQuestion),
      contextUpdate: {
        lastQuestion: sanitizedQuestion,
        lastIntent: "non_meeting",
      },
    };
  }

  const meetingContexts = await (
    dependencies.listEventContextsForDate ?? listEventContextsForDate
  )(targetDate);

  if (meetingContexts.length === 0) {
    return {
      text: buildNoMeetingsReply(targetDate, config.timezone),
      contextUpdate: {
        lastTargetDate: targetDate,
        lastQuestion: sanitizedQuestion,
        lastIntent: "no_meetings",
        lastMeetingTitle: undefined,
      },
    };
  }

  const focus = inferQuestionFocus(sanitizedQuestion);
  const referencedMeeting = findReferencedMeeting(
    sanitizedQuestion,
    meetingContexts,
    priorContext,
  );

  if (config.briefingSynthesisMode !== "fireworks" || !config.fireworks) {
    return {
      text: buildDeterministicAssistantReply(
        sanitizedQuestion,
        targetDate,
        config.timezone,
        meetingContexts,
        priorContext,
      ),
      contextUpdate: buildContextUpdate(
        sanitizedQuestion,
        targetDate,
        focus,
        referencedMeeting,
      ),
    };
  }

  try {
    const displayDate = formatDisplayDate(targetDate, config.timezone);
    const content = await (
      dependencies.createFireworksChatCompletion ?? createFireworksChatCompletion
    )({
      apiKey: config.fireworks.apiKey,
      model: config.fireworks.model,
      timeoutMs: config.fireworks.timeoutMs,
      temperature: 0.3,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a concise chief of staff assistant replying inside Telegram. Answer only from the provided meeting context. You can answer about meeting schedules, attendees, locations, priorities, risks, prep, and specific meeting titles. If the current question is a follow-up, use the supplied conversation context. If details are thin, say so clearly. Keep the response chat-friendly: one short direct answer followed by 'Key points:' and 3-5 bullet lines.",
        },
        {
          role: "user",
          content: [
            `Date: ${targetDate} (${displayDate})`,
            `Timezone: ${config.timezone}`,
            `Question: ${sanitizedQuestion}`,
            `Conversation context: ${JSON.stringify(
              {
                lastTargetDate: priorContext?.lastTargetDate ?? null,
                lastMeetingTitle: priorContext?.lastMeetingTitle ?? null,
                lastIntent: priorContext?.lastIntent ?? null,
                lastQuestion: priorContext?.lastQuestion ?? null,
              },
              null,
              2,
            )}`,
            "",
            "Meeting context:",
            JSON.stringify(buildMeetingContextPayload(meetingContexts), null, 2),
          ].join("\n"),
        },
      ],
    });

    return {
      text: normalizeAssistantReply(content),
      contextUpdate: buildContextUpdate(
        sanitizedQuestion,
        targetDate,
        focus,
        referencedMeeting,
      ),
    };
  } catch {
    return {
      text: buildDeterministicAssistantReply(
        sanitizedQuestion,
        targetDate,
        config.timezone,
        meetingContexts,
        priorContext,
      ),
      contextUpdate: buildContextUpdate(
        sanitizedQuestion,
        targetDate,
        focus,
        referencedMeeting,
      ),
    };
  }
}

export function parseTelegramTargetDate(
  text: string,
  timezone: string,
  now: Date = new Date(),
  priorContext: TelegramChatContext | null = null,
) {
  return resolveTargetDateFromQuestion(text, timezone, now, priorContext);
}

export async function buildTelegramAssistantReply(
  question: string,
  dependencies: TelegramAssistantDependencies = {},
) {
  const turn = await buildTelegramAssistantTurn(question, dependencies);
  return turn.text;
}

export async function processTelegramUpdate(
  update: TelegramUpdate,
  dependencies: TelegramAssistantDependencies = {},
) {
  const config = getAppConfig();
  const message = update.message;

  if (!message?.chat?.id) {
    return {
      handled: false,
      replied: false,
    };
  }

  const sendText = dependencies.sendTelegramText ?? sendTelegramText;
  const botToken = config.telegramBotToken ?? config.telegram?.botToken;
  const readContext =
    dependencies.readTelegramChatContext ?? readTelegramChatContext;
  const writeContext =
    dependencies.writeTelegramChatContext ?? writeTelegramChatContext;

  if (!botToken) {
    throw new Error("Telegram bot token is not configured.");
  }

  if (!message.text?.trim()) {
    await sendText({
      botToken,
      chatId: message.chat.id,
      replyToMessageId: message.message_id,
      text: "Send a text question about your meetings, such as 'What are the biggest risks across my meetings today?'",
    });

    return {
      handled: true,
      replied: true,
    };
  }

  const priorContext =
    dependencies.priorContext ?? (await readContext(message.chat.id));
  const turn = await buildTelegramAssistantTurn(message.text, {
    ...dependencies,
    priorContext,
  });

  await sendText({
    botToken,
    chatId: message.chat.id,
    replyToMessageId: message.message_id,
    text: turn.text,
  });

  if (turn.contextUpdate) {
    await writeContext({
      chatId: String(message.chat.id),
      lastTargetDate:
        turn.contextUpdate.lastTargetDate ?? priorContext?.lastTargetDate,
      lastQuestion: turn.contextUpdate.lastQuestion ?? message.text,
      lastIntent: turn.contextUpdate.lastIntent ?? priorContext?.lastIntent,
      lastMeetingTitle:
        turn.contextUpdate.lastMeetingTitle ?? priorContext?.lastMeetingTitle,
    });
  }

  return {
    handled: true,
    replied: true,
  };
}
