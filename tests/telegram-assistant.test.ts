import test from "node:test";
import assert from "node:assert/strict";
import { resetAppConfigForTests } from "@/lib/config";
import {
  buildTelegramAssistantReply,
  parseTelegramTargetDate,
  processTelegramUpdate,
} from "@/lib/telegram-assistant";
import { eventContextFixture } from "@/tests/fixtures";

const baseEnv = {
  APP_TIMEZONE: "Asia/Manila",
  CRON_SECRET: "secret",
  GOOGLE_AUTH_MODE: "oauth",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
};

test("parseTelegramTargetDate supports explicit dates", () => {
  const targetDate = parseTelegramTargetDate(
    "How should I prepare for 2026-03-31?",
    "Asia/Manila",
    new Date("2026-03-27T15:00:00.000Z"),
  );

  assert.equal(targetDate, "2026-03-31");
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

test("processTelegramUpdate replies to incoming text messages", async () => {
  const originalEnv = process.env;
  const sent: Array<{
    botToken: string;
    chatId: number | string;
    text: string;
    replyToMessageId?: number;
  }> = [];

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
