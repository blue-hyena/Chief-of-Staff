import test from "node:test";
import assert from "node:assert/strict";
import { resetAppConfigForTests } from "@/lib/config";
import {
  buildTelegramAssistantReply,
  parseTelegramTargetDate,
  processTelegramUpdate,
} from "@/lib/telegram-assistant";
import { ActionProposal, AgentTask, MeetingSnapshot } from "@/lib/types";
import { eventContextFixture } from "@/tests/fixtures";

const baseEnv = {
  APP_TIMEZONE: "Asia/Manila",
  CRON_SECRET: "secret",
  GOOGLE_AUTH_MODE: "oauth",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
};

const pendingTaskFixture: AgentTask = {
  id: "task-1",
  sourceMeetingId: eventContextFixture.eventId,
  title: "Confirm board narrative owner",
  detail: "Lock who owns the board narrative before the prep session.",
  status: "pending",
  priority: "high",
  createdAt: "2026-03-24T21:00:00.000Z",
  updatedAt: "2026-03-24T21:00:00.000Z",
};

const pendingProposalFixture: ActionProposal = {
  id: "proposal-1",
  kind: "send_email",
  status: "pending",
  sourceMeetingId: eventContextFixture.eventId,
  targetDate: "2026-03-25",
  title: "Send board recap draft",
  summary: "Draft follow-up email for the board prep meeting.",
  payload: {
    to: ["alex@example.com"],
    subject: "Board Prep Recap",
    text: "Here is the recap.",
    summary: "Email recap",
  },
  createdAt: "2026-03-24T21:00:00.000Z",
  updatedAt: "2026-03-24T21:00:00.000Z",
};

const prepSnapshotFixture: MeetingSnapshot = {
  id: "snapshot-1",
  eventId: eventContextFixture.eventId,
  localDate: "2026-03-25",
  prepBrief: {
    brief: "Prepare the board narrative and funding posture.",
    agenda: ["Review board narrative", "Confirm funding posture"],
    risks: ["Narrative still soft"],
    decisionsToDrive: ["Lock the narrative owner"],
    stakeholderSignals: ["Watch for confidence mismatch"],
    confidence: "medium",
  },
  createdAt: "2026-03-24T21:00:00.000Z",
  updatedAt: "2026-03-24T21:00:00.000Z",
};

test("parseTelegramTargetDate supports explicit dates", () => {
  const targetDate = parseTelegramTargetDate(
    "How should I prepare for 2026-03-31?",
    "Asia/Manila",
    new Date("2026-03-27T15:00:00.000Z"),
  );

  assert.equal(targetDate, "2026-03-31");
});

test("parseTelegramTargetDate supports month-name and weekday dates", () => {
  const now = new Date("2026-03-27T15:00:00.000Z");

  assert.equal(
    parseTelegramTargetDate(
      "What are my meetings for April 1, 2026?",
      "Asia/Manila",
      now,
    ),
    "2026-04-01",
  );
  assert.equal(
    parseTelegramTargetDate("What do I have next Wednesday?", "Asia/Manila", now),
    "2026-04-01",
  );
});

test("parseTelegramTargetDate uses prior context for follow-up questions", () => {
  const now = new Date("2026-03-27T15:00:00.000Z");

  assert.equal(
    parseTelegramTargetDate("What could slip if these meetings go badly?", "Asia/Manila", now, {
      chatId: "8701359825",
      lastTargetDate: "2026-03-31",
    }),
    "2026-03-31",
  );
  assert.equal(
    parseTelegramTargetDate("What about the meetings tomorrow?", "Asia/Manila", now, {
      chatId: "8701359825",
      lastTargetDate: "2026-03-31",
    }),
    "2026-04-01",
  );
});

test("parseTelegramTargetDate supports tomorrow and defaults to today", () => {
  const now = new Date("2026-03-27T15:00:00.000Z");

  assert.equal(
    parseTelegramTargetDate("What should I do tomorrow?", "Asia/Manila", now),
    "2026-03-28",
  );
  assert.equal(
    parseTelegramTargetDate("Summarize my meetings", "Asia/Manila", now),
    "2026-03-27",
  );
});

test("buildTelegramAssistantReply uses Fireworks for grounded chat replies", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "fireworks",
      FIREWORKS_API_KEY: "fw-test",
      FIREWORKS_MODEL: "accounts/fireworks/models/minimax-m2p5",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply(
      "What are the biggest risks across my meetings today?",
      {
        createFireworksChatCompletion: async () =>
          "The biggest risks are ownership drift and vendor slippage.\n\nKey points:\n- Standup blockers need explicit owners.\n- Risk review needs mitigation deadlines.\n- Vendor timing should be reconfirmed.",
        listEventContextsForDate: async () => [eventContextFixture],
        now: () => new Date("2026-03-24T21:00:00.000Z"),
      },
    );

    assert.match(reply, /biggest risks/i);
    assert.match(reply, /Key points:/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply falls back when Fireworks fails", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "fireworks",
      FIREWORKS_API_KEY: "fw-test",
      FIREWORKS_MODEL: "accounts/fireworks/models/minimax-m2p5",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply(
      "What should I do before each meeting today?",
      {
        createFireworksChatCompletion: async () => {
          throw new Error("timeout");
        },
        listEventContextsForDate: async () => [eventContextFixture],
        now: () => new Date("2026-03-24T21:00:00.000Z"),
      },
    );

    assert.match(reply, /Before the/);
    assert.match(reply, /Key points:/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply returns a non-meeting fallback for unrelated messages", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("you are enough", {
      now: () => new Date("2026-03-24T21:00:00.000Z"),
    });

    assert.match(reply, /Glad to help|I’m focused on your meetings/);
    assert.doesNotMatch(reply, /I don't see any meetings/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply answers schedule questions in deterministic mode", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("What are my meetings for April 1, 2026?", {
      listEventContextsForDate: async () => [eventContextFixture],
      now: () => new Date("2026-03-24T21:00:00.000Z"),
    });

    assert.match(reply, /You have 1 meeting/);
    assert.match(reply, /Board Prep/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply answers specific meeting attendee questions", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("Who is in the Board Prep meeting?", {
      listEventContextsForDate: async () => [eventContextFixture],
      now: () => new Date("2026-03-24T21:00:00.000Z"),
    });

    assert.match(reply, /attendees/i);
    assert.match(reply, /Alex/);
    assert.match(reply, /Jamie/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply uses prior context for follow-up risk questions", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply(
      "What could slip if these meetings go badly?",
      {
        priorContext: {
          chatId: "8701359825",
          lastTargetDate: "2026-03-31",
          lastIntent: "schedule",
        },
        listEventContextsForDate: async () => [eventContextFixture],
        now: () => new Date("2026-03-24T21:00:00.000Z"),
      },
    );

    assert.match(reply, /The biggest risks on/);
    assert.doesNotMatch(reply, /I don't see any meetings/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply lists open tasks for /tasks", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("/tasks", {
      listOpenAgentTasks: async () => [pendingTaskFixture],
    });

    assert.match(reply, /open agent task/i);
    assert.match(reply, /Confirm board narrative owner/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply lists pending proposals for /followups", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("/followups", {
      listPendingActionProposals: async () => [pendingProposalFixture],
    });

    assert.match(reply, /pending proposal/i);
    assert.match(reply, /proposal-1/);
    assert.match(reply, /Send board recap draft/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildTelegramAssistantReply renders agenda details for /agenda", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const reply = await buildTelegramAssistantReply("/agenda Board Prep", {
      priorContext: {
        chatId: "8701359825",
        lastTargetDate: "2026-03-25",
        lastMeetingTitle: "Board Prep",
      },
      listEventContextsForDate: async () => [eventContextFixture],
      listMeetingSnapshotsForDate: async () => [prepSnapshotFixture],
      now: () => new Date("2026-03-24T21:00:00.000Z"),
    });

    assert.match(reply, /Agenda for Board Prep/);
    assert.match(reply, /Review board narrative/);
    assert.match(reply, /Decision: Lock the narrative owner/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("processTelegramUpdate replies to incoming text messages", async () => {
  const originalEnv = process.env;
  const sent: Array<{
    botToken: string;
    chatId: number | string;
    text: string;
    replyToMessageId?: number;
  }> = [];
  const writtenContexts: Array<Record<string, string | undefined>> = [];

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const result = await processTelegramUpdate(
      {
        update_id: 1,
        message: {
          message_id: 42,
          text: "Summarize my meetings today",
          chat: {
            id: 8701359825,
            type: "private",
          },
        },
      },
      {
        listEventContextsForDate: async () => [eventContextFixture],
        now: () => new Date("2026-03-24T21:00:00.000Z"),
        readTelegramChatContext: async () => null,
        writeTelegramChatContext: async (context) => {
          writtenContexts.push({
            chatId: context.chatId,
            lastTargetDate: context.lastTargetDate,
            lastIntent: context.lastIntent,
            lastMeetingTitle: context.lastMeetingTitle,
          });
        },
        sendTelegramText: async (options) => {
          sent.push(options);
        },
      },
    );

    assert.deepEqual(result, {
      handled: true,
      replied: true,
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.chatId, 8701359825);
    assert.equal(sent[0]?.replyToMessageId, 42);
    assert.match(sent[0]?.text ?? "", /Key points:/);
    assert.equal(writtenContexts.length, 1);
    assert.equal(writtenContexts[0]?.chatId, "8701359825");
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("processTelegramUpdate prompts for text when the message is unsupported", async () => {
  const originalEnv = process.env;
  const sent: string[] = [];

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const result = await processTelegramUpdate(
      {
        update_id: 2,
        message: {
          message_id: 43,
          chat: {
            id: 8701359825,
            type: "private",
          },
        },
      },
      {
        readTelegramChatContext: async () => null,
        writeTelegramChatContext: async () => {},
        sendTelegramText: async ({ text }) => {
          sent.push(text);
        },
      },
    );

    assert.deepEqual(result, {
      handled: true,
      replied: true,
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? "", /Send a text question about your meetings/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("processTelegramUpdate preserves follow-up context across turns", async () => {
  const originalEnv = process.env;
  const sent: string[] = [];
  const writtenContexts: Array<Record<string, string | undefined>> = [];

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const result = await processTelegramUpdate(
      {
        update_id: 3,
        message: {
          message_id: 44,
          text: "What could slip if these meetings go badly?",
          chat: {
            id: 8701359825,
            type: "private",
          },
        },
      },
      {
        listEventContextsForDate: async () => [eventContextFixture],
        now: () => new Date("2026-03-24T21:00:00.000Z"),
        readTelegramChatContext: async () => ({
          chatId: "8701359825",
          lastTargetDate: "2026-03-31",
          lastIntent: "schedule",
        }),
        writeTelegramChatContext: async (context) => {
          writtenContexts.push({
            chatId: context.chatId,
            lastTargetDate: context.lastTargetDate,
            lastIntent: context.lastIntent,
          });
        },
        sendTelegramText: async ({ text }) => {
          sent.push(text);
        },
      },
    );

    assert.deepEqual(result, {
      handled: true,
      replied: true,
    });
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0] ?? "", /I don't see any meetings/);
    assert.equal(writtenContexts[0]?.lastTargetDate, "2026-03-31");
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("processTelegramUpdate can approve an agent proposal", async () => {
  const originalEnv = process.env;
  const sent: string[] = [];

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "deterministic",
    };
    resetAppConfigForTests();

    const result = await processTelegramUpdate(
      {
        update_id: 4,
        message: {
          message_id: 45,
          text: "/approve proposal-1",
          chat: {
            id: 8701359825,
            type: "private",
          },
        },
      },
      {
        executeActionProposal: async () => ({
          ...pendingProposalFixture,
          status: "executed",
          executedAt: "2026-03-24T21:05:00.000Z",
        }),
        readTelegramChatContext: async () => null,
        writeTelegramChatContext: async () => {},
        sendTelegramText: async ({ text }) => {
          sent.push(text);
        },
      },
    );

    assert.deepEqual(result, {
      handled: true,
      replied: true,
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? "", /Approved and executed/);
    assert.match(sent[0] ?? "", /proposal-1/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});
