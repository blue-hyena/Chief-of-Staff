import test from "node:test";
import assert from "node:assert/strict";
import { getAppConfig, resetAppConfigForTests } from "@/lib/config";

const baseEnv = {
  APP_TIMEZONE: "Asia/Manila",
  CRON_SECRET: "secret",
  GOOGLE_AUTH_MODE: "oauth",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
};

test("getAppConfig only requires Telegram settings when Telegram delivery is enabled", () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_DELIVERY_CHANNELS: "telegram",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "-10012345",
    };
    resetAppConfigForTests();

    const config = getAppConfig();

    assert.deepEqual(config.briefingDeliveryChannels, ["telegram"]);
    assert.equal(config.briefingRecipientEmail, undefined);
    assert.equal(config.telegram?.chatId, "-10012345");
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("getAppConfig rejects missing Telegram settings when Telegram delivery is enabled", () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_DELIVERY_CHANNELS: "email,telegram",
      BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
    };
    resetAppConfigForTests();

    assert.throws(
      () => getAppConfig(),
      /Missing TELEGRAM_BOT_TOKEN while Telegram delivery is enabled/,
    );
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("getAppConfig only requires Fireworks settings when Fireworks synthesis is enabled", () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "fireworks",
      FIREWORKS_API_KEY: "fw-test",
      FIREWORKS_MODEL: "accounts/fireworks/models/kimi-k2p5",
    };
    resetAppConfigForTests();

    const config = getAppConfig();

    assert.equal(config.briefingSynthesisMode, "fireworks");
    assert.equal(config.fireworks?.model, "accounts/fireworks/models/kimi-k2p5");
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("getAppConfig rejects missing Fireworks API key when Fireworks synthesis is enabled", () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      BRIEFING_SYNTHESIS_MODE: "fireworks",
    };
    resetAppConfigForTests();

    assert.throws(
      () => getAppConfig(),
      /Missing FIREWORKS_API_KEY while Fireworks synthesis is enabled/,
    );
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});
