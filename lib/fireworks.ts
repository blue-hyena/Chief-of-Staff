import { z } from "zod";
import { BriefingPayload, EventContext, MeetingBriefing } from "@/lib/types";

const PROMPT_ATTACHMENT_LIMIT = 3;
const PROMPT_ATTACHMENT_TEXT_LIMIT = 1800;

const FireworksMeetingSynthesisSchema = z.object({
  eventId: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string()),
  prepNotes: z.array(z.string()),
  risks: z.array(z.string()),
  actionItems: z.array(z.string()),
  pmSynthesis: z.object({
    recommendedTalkingPoints: z.array(z.string()),
    decisionsToDrive: z.array(z.string()),
    stakeholderSignals: z.array(z.string()),
  }),
});

const FireworksBriefingContentSchema = z.object({
  executiveSummary: z.string().min(1),
  topActions: z.array(z.string()),
  meetings: z.array(FireworksMeetingSynthesisSchema),
  pmSynthesis: z.object({
    dailyPriorities: z.array(z.string()),
    crossMeetingRisks: z.array(z.string()),
    stakeholderUpdateDraft: z.array(z.string()),
  }),
});

const FireworksChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

type BuildFireworksDigestOptions = {
  apiKey: string;
  calendarId: string;
  meetingContexts: EventContext[];
  model: string;
  targetDate: string;
  timeoutMs: number;
  timezone: string;
};

type BuildFireworksDigestDependencies = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type FireworksChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CreateFireworksChatCompletionOptions = {
  apiKey: string;
  model: string;
  messages: FireworksChatMessage[];
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: {
    type: "json_object";
  };
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeList(values: string[], fallback: string) {
  const cleaned = values
    .map((value) => compactText(value))
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned.slice(0, 6) : [fallback];
}

function buildMeetingBriefing(
  event: EventContext,
  synthesizedMeeting: z.infer<typeof FireworksMeetingSynthesisSchema>,
): MeetingBriefing {
  return {
    eventId: event.eventId,
    title: event.title,
    start: event.start,
    end: event.end,
    participants: event.attendees.map(
      (attendee) => attendee.name || attendee.email || "Unknown",
    ),
    summary: compactText(synthesizedMeeting.summary),
    keyPoints: sanitizeList(
      synthesizedMeeting.keyPoints,
      "No key points were identified from the available context.",
    ),
    prepNotes: sanitizeList(
      synthesizedMeeting.prepNotes,
      "Limited prep context was available for this meeting.",
    ),
    risks: sanitizeList(
      synthesizedMeeting.risks,
      "No material risks were identified from the available context.",
    ),
    actionItems: sanitizeList(
      synthesizedMeeting.actionItems,
      "Review the meeting context and confirm the desired outcome before start time.",
    ),
    sourceReferences: event.attachments.map((attachment) => attachment.title),
    pmSynthesis: {
      recommendedTalkingPoints: sanitizeList(
        synthesizedMeeting.pmSynthesis.recommendedTalkingPoints,
        "Open by aligning on the decision, outcome, and owner for follow-through.",
      ),
      decisionsToDrive: sanitizeList(
        synthesizedMeeting.pmSynthesis.decisionsToDrive,
        "Confirm the next step, explicit owner, and target date before the meeting ends.",
      ),
      stakeholderSignals: sanitizeList(
        synthesizedMeeting.pmSynthesis.stakeholderSignals,
        "Watch for ambiguity around ownership, sequencing, or approval expectations.",
      ),
    },
  };
}

function validateMeetingCoverage(
  eventContexts: EventContext[],
  synthesizedMeetings: z.infer<typeof FireworksMeetingSynthesisSchema>[],
) {
  const expectedIds = new Set(eventContexts.map((event) => event.eventId));
  const seenIds = new Set<string>();

  for (const meeting of synthesizedMeetings) {
    if (!expectedIds.has(meeting.eventId)) {
      throw new Error(`Fireworks returned an unknown eventId: ${meeting.eventId}`);
    }

    if (seenIds.has(meeting.eventId)) {
      throw new Error(`Fireworks returned a duplicate eventId: ${meeting.eventId}`);
    }

    seenIds.add(meeting.eventId);
  }

  for (const event of eventContexts) {
    if (!seenIds.has(event.eventId)) {
      throw new Error(`Fireworks omitted eventId: ${event.eventId}`);
    }
  }
}

function buildPromptPayload(options: BuildFireworksDigestOptions) {
  return {
    targetDate: options.targetDate,
    timezone: options.timezone,
    meetings: options.meetingContexts.map((event) => ({
      eventId: event.eventId,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location ?? null,
      description: event.description || null,
      participants: event.attendees.map(
        (attendee) => attendee.name || attendee.email || "Unknown",
      ),
      attachments: event.attachments.slice(0, PROMPT_ATTACHMENT_LIMIT).map((attachment) => ({
        title: attachment.title,
        mimeType: attachment.mimeType,
        extractedChars: attachment.extractedChars,
        extractionError: attachment.extractionError ?? null,
        extractedTextSnippet: attachment.extractedText
          .slice(0, PROMPT_ATTACHMENT_TEXT_LIMIT)
          .trim(),
      })),
    })),
  };
}

function extractStructuredContent(rawContent: string) {
  const trimmed = rawContent.trim();

  if (trimmed.startsWith("```")) {
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);

    if (fenceMatch) {
      return fenceMatch[1];
    }
  }

  return trimmed;
}

function buildFireworksErrorMessage(responseText: string, status: number) {
  const compact = compactText(responseText);
  const suffix = compact ? ` ${compact.slice(0, 240)}` : "";
  return `Fireworks API request failed with status ${status}.${suffix}`.trim();
}

export async function createFireworksChatCompletion(
  options: CreateFireworksChatCompletionOptions,
  dependencies: BuildFireworksDigestDependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetchImpl(
      "https://api.fireworks.ai/inference/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 3500,
          ...(options.responseFormat
            ? {
                response_format: options.responseFormat,
              }
            : {}),
          messages: options.messages,
        }),
        signal: controller.signal,
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(buildFireworksErrorMessage(responseText, response.status));
    }

    const parsedResponse = FireworksChatResponseSchema.parse(
      JSON.parse(responseText),
    );
    const content = parsedResponse.choices[0]?.message.content;

    if (!content) {
      throw new Error("Fireworks returned an empty chat completion.");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildFireworksDigest(
  options: BuildFireworksDigestOptions,
  dependencies: BuildFireworksDigestDependencies = {},
): Promise<BriefingPayload> {
  const now = dependencies.now ?? (() => new Date());
  const content = await createFireworksChatCompletion(
    {
      apiKey: options.apiKey,
      model: options.model,
      timeoutMs: options.timeoutMs,
      temperature: 0.2,
      maxTokens: 3500,
      responseFormat: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content:
            "You are an experienced chief of staff preparing a sharp, practical morning briefing. Return only valid JSON. Do not invent meetings or event IDs. Base every output on the provided meeting context. Keep outputs concise, specific, and action-oriented.",
        },
        {
          role: "user",
          content: [
            "Generate a JSON object with this exact structure:",
            '{ "executiveSummary": string, "topActions": string[], "meetings": [{ "eventId": string, "summary": string, "keyPoints": string[], "prepNotes": string[], "risks": string[], "actionItems": string[], "pmSynthesis": { "recommendedTalkingPoints": string[], "decisionsToDrive": string[], "stakeholderSignals": string[] } }], "pmSynthesis": { "dailyPriorities": string[], "crossMeetingRisks": string[], "stakeholderUpdateDraft": string[] } }',
            "Return one meetings entry for every provided eventId and do not add extra meetings.",
            "Use concise business language. Mention limited context explicitly when source material is thin.",
            "",
            JSON.stringify(buildPromptPayload(options), null, 2),
          ].join("\n"),
        },
      ],
    },
    dependencies,
  );

  const structuredContent = FireworksBriefingContentSchema.parse(
    JSON.parse(extractStructuredContent(content)),
  );

  validateMeetingCoverage(options.meetingContexts, structuredContent.meetings);

  const synthesizedMeetings = new Map(
    structuredContent.meetings.map((meeting) => [meeting.eventId, meeting]),
  );

  return {
    date: options.targetDate,
    executiveSummary: compactText(structuredContent.executiveSummary),
    topActions: sanitizeList(
      structuredContent.topActions,
      "Review the meeting context and confirm the highest-stakes decisions for the day.",
    ),
    meetings: options.meetingContexts.map((event) =>
      buildMeetingBriefing(event, synthesizedMeetings.get(event.eventId)!),
    ),
    pmSynthesis: {
      dailyPriorities: sanitizeList(
        structuredContent.pmSynthesis.dailyPriorities,
        "Align the day around the highest-stakes decisions and follow-through.",
      ),
      crossMeetingRisks: sanitizeList(
        structuredContent.pmSynthesis.crossMeetingRisks,
        "Main operational risk is ambiguity around ownership or sequencing across meetings.",
      ),
      stakeholderUpdateDraft: sanitizeList(
        structuredContent.pmSynthesis.stakeholderUpdateDraft,
        "Today’s focus is turning meeting context into clear decisions, owners, and follow-up.",
      ),
    },
    metadata: {
      calendarId: options.calendarId,
      timezone: options.timezone,
      generatedAt: now().toISOString(),
      notes: [`Synthesis mode: Fireworks via ${options.model}.`],
    },
  };
}
