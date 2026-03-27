import { getAppConfig } from "@/lib/config";
import { buildDeterministicDigest } from "@/lib/digest";
import { createFireworksChatCompletion } from "@/lib/fireworks";
import { listEventContextsForDate } from "@/lib/google-workspace";
import {
  addDaysToLocalDate,
  formatDisplayDate,
  formatLocalDateTime,
  getLocalDateString,
} from "@/lib/time";
import {
  sendTelegramText,
  TelegramUpdate,
} from "@/lib/telegram";
import { EventContext } from "@/lib/types";

const TELEGRAM_ASSISTANT_ATTACHMENT_LIMIT = 2;
const TELEGRAM_ASSISTANT_ATTACHMENT_TEXT_LIMIT = 900;

type TelegramAssistantDependencies = {
  createFireworksChatCompletion?: (
    options: Parameters<typeof createFireworksChatCompletion>[0],
  ) => Promise<string>;
  listEventContextsForDate?: (localDate: string) => Promise<EventContext[]>;
  now?: () => Date;
  sendTelegramText?: typeof sendTelegramText;
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

function inferQuestionFocus(question: string) {
  const lower = question.toLowerCase();

  if (
    lower.includes("risk") ||
    lower.includes("blocker") ||
    lower.includes("concern")
  ) {
    return "risks";
  }

  if (
    lower.includes("prep") ||
    lower.includes("prepare") ||
    lower.includes("before each") ||
    lower.includes("what should i do")
  ) {
    return "prep";
  }

  return "summary";
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
    "- If you meant another date, send it as YYYY-MM-DD.",
    "- I can still help summarize another day or prep for a specific meeting title.",
  ].join("\n");
}

function buildDeterministicAssistantReply(
  question: string,
  targetDate: string,
  timezone: string,
  meetingContexts: EventContext[],
) {
  if (meetingContexts.length === 0) {
    return buildNoMeetingsReply(targetDate, timezone);
  }

  const digest = buildDeterministicDigest(targetDate, meetingContexts);
  const displayDate = formatDisplayDate(targetDate, timezone);
  const focus = inferQuestionFocus(question);

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

  return [
    digest.executiveSummary,
    "",
    "Key points:",
    ...digest.topActions.slice(0, 5).map((item) => `- ${item}`),
  ].join("\n");
}

function buildCommandReply(
  text: string,
  targetDate: string,
  timezone: string,
) {
  const lower = text.trim().toLowerCase();

  if (lower.startsWith("/start")) {
    return [
      "I can answer questions about your meetings and related prep.",
      "",
      "Try messages like:",
      "- What are the biggest risks across my meetings today?",
      `- Summarize my ${targetDate} meetings in plain English.`,
      "- What should I do before each meeting tomorrow?",
    ].join("\n");
  }

  if (lower.startsWith("/help")) {
    return [
      "Ask me about your meetings using natural language.",
      "",
      "Supported patterns:",
      "- today / tomorrow",
      "- explicit dates like 2026-03-31",
      "- risks, prep, priorities, and summaries",
      "",
      "Examples:",
      "- What are the biggest risks across my meetings today?",
      "- How should I prepare for 2026-03-31?",
      "- Summarize tomorrow's meetings.",
    ].join("\n");
  }

  return null;
}

export function parseTelegramTargetDate(
  text: string,
  timezone: string,
  now: Date = new Date(),
) {
  const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (explicitDate) {
    return explicitDate[1];
  }

  const today = getLocalDateString(now, timezone);
  const lower = text.toLowerCase();

  if (lower.includes("tomorrow")) {
    return addDaysToLocalDate(today, 1);
  }

  return today;
}

export async function buildTelegramAssistantReply(
  question: string,
  dependencies: TelegramAssistantDependencies = {},
) {
  const config = getAppConfig();
  const now = dependencies.now ?? (() => new Date());
  const targetDate = parseTelegramTargetDate(question, config.timezone, now());
  const commandReply = buildCommandReply(question, targetDate, config.timezone);

  if (commandReply) {
    return commandReply;
  }

  const sanitizedQuestion = sanitizeQuestion(question);
  const meetingContexts = await (
    dependencies.listEventContextsForDate ?? listEventContextsForDate
  )(targetDate);

  if (meetingContexts.length === 0) {
    return buildNoMeetingsReply(targetDate, config.timezone);
  }

  if (config.briefingSynthesisMode !== "fireworks" || !config.fireworks) {
    return buildDeterministicAssistantReply(
      sanitizedQuestion,
      targetDate,
      config.timezone,
      meetingContexts,
    );
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
            "You are a concise chief of staff assistant replying inside Telegram. Answer only from the provided meeting context. If details are thin, say so clearly. Keep the response chat-friendly: one short direct answer followed by 'Key points:' and 3-5 bullet lines.",
        },
        {
          role: "user",
          content: [
            `Date: ${targetDate} (${displayDate})`,
            `Timezone: ${config.timezone}`,
            `Question: ${sanitizedQuestion}`,
            "",
            "Meeting context:",
            JSON.stringify(buildMeetingContextPayload(meetingContexts), null, 2),
          ].join("\n"),
        },
      ],
    });

    return normalizeAssistantReply(content);
  } catch {
    return buildDeterministicAssistantReply(
      sanitizedQuestion,
      targetDate,
      config.timezone,
      meetingContexts,
    );
  }
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

  const reply = await buildTelegramAssistantReply(message.text, dependencies);

  await sendText({
    botToken,
    chatId: message.chat.id,
    replyToMessageId: message.message_id,
    text: reply,
  });

  return {
    handled: true,
    replied: true,
  };
}
