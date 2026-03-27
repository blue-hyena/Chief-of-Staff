import { BriefingPayload } from "@/lib/types";
import { formatDisplayDate, formatLocalDateTime } from "@/lib/time";

const TELEGRAM_MESSAGE_LIMIT = 4000;

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: TelegramChat;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

function renderBulletList(items: string[], fallback = "None noted.") {
  if (items.length === 0) {
    return [`- ${fallback}`];
  }

  return items.map((item) => `- ${item}`);
}

function splitMessage(text: string, maxLength = TELEGRAM_MESSAGE_LIMIT) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of text.split("\n\n")) {
    const candidate = currentChunk ? `${currentChunk}\n\n${section}` : section;

    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
    }

    if (section.length <= maxLength) {
      currentChunk = section;
      continue;
    }

    const lines = section.split("\n");
    let lineChunk = "";

    for (const line of lines) {
      const lineCandidate = lineChunk ? `${lineChunk}\n${line}` : line;

      if (lineCandidate.length <= maxLength) {
        lineChunk = lineCandidate;
        continue;
      }

      if (lineChunk) {
        chunks.push(lineChunk);
      }

      if (line.length <= maxLength) {
        lineChunk = line;
        continue;
      }

      for (let index = 0; index < line.length; index += maxLength) {
        chunks.push(line.slice(index, index + maxLength));
      }

      lineChunk = "";
    }

    if (lineChunk) {
      currentChunk = lineChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function renderTelegramBriefing(payload: BriefingPayload) {
  const displayDate = formatDisplayDate(payload.date, payload.metadata.timezone);
  const sections = [
    [
      `Morning Briefing - ${displayDate}`,
      "",
      payload.executiveSummary,
    ].join("\n"),
    [
      "Top Actions",
      ...renderBulletList(payload.topActions),
    ].join("\n"),
    [
      "PM Synthesis",
      "Daily Priorities:",
      ...renderBulletList(payload.pmSynthesis.dailyPriorities),
      "Cross-Meeting Risks:",
      ...renderBulletList(payload.pmSynthesis.crossMeetingRisks),
    ].join("\n"),
    ...payload.meetings.map((meeting) =>
      [
        `${meeting.title} (${formatLocalDateTime(
          meeting.start,
          payload.metadata.timezone,
        )} to ${formatLocalDateTime(meeting.end, payload.metadata.timezone)})`,
        `Summary: ${meeting.summary}`,
        "Action Items:",
        ...renderBulletList(meeting.actionItems),
        "Risks:",
        ...renderBulletList(meeting.risks),
      ].join("\n"),
    ),
  ];

  return splitMessage(sections.join("\n\n"));
}

export async function sendTelegramMessage(options: {
  botToken: string;
  chatId: string;
  messages: string[];
}) {
  for (const message of options.messages) {
    const response = await fetch(
      `https://api.telegram.org/bot${options.botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: message,
          disable_web_page_preview: true,
        }),
      },
    );

    const result = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;

    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.description || `Telegram API request failed with status ${response.status}.`,
      );
    }
  }
}

export async function sendTelegramText(options: {
  botToken: string;
  chatId: number | string;
  text: string;
  replyToMessageId?: number;
}) {
  const messages = splitMessage(options.text);

  for (const [index, message] of messages.entries()) {
    const response = await fetch(
      `https://api.telegram.org/bot${options.botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: message,
          disable_web_page_preview: true,
          ...(index === 0 && options.replyToMessageId
            ? {
                reply_to_message_id: options.replyToMessageId,
              }
            : {}),
        }),
      },
    );

    const result = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;

    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.description || `Telegram API request failed with status ${response.status}.`,
      );
    }
  }
}
