import test from "node:test";
import assert from "node:assert/strict";
import { deliverBriefing } from "@/lib/delivery";
import { briefingPayloadFixture } from "@/tests/fixtures";

test("deliverBriefing skips sends during dry run", async () => {
  const deliveries = await deliverBriefing(
    briefingPayloadFixture,
    {
      channels: ["email", "telegram"],
      dryRun: true,
      email: {
        to: "ops@example.com",
      },
      telegram: {
        botToken: "token",
        chatId: "123",
      },
    },
    {
      sendEmail: async () => {
        throw new Error("should not send email during dry run");
      },
      sendTelegramMessage: async () => {
        throw new Error("should not send telegram during dry run");
      },
    },
  );

  assert.deepEqual(deliveries, {
    email: {
      attempted: false,
      sent: false,
    },
    telegram: {
      attempted: false,
      sent: false,
    },
  });
});

test("deliverBriefing reports partial success per channel", async () => {
  const calls = {
    email: 0,
    telegram: 0,
  };
  const deliveries = await deliverBriefing(
    briefingPayloadFixture,
    {
      channels: ["email", "telegram"],
      email: {
        to: "ops@example.com",
      },
      telegram: {
        botToken: "token",
        chatId: "123",
      },
    },
    {
      sendEmail: async () => {
        calls.email += 1;
      },
      sendTelegramMessage: async () => {
        calls.telegram += 1;
        throw new Error("chat not found");
      },
    },
  );

  assert.equal(calls.email, 1);
  assert.equal(calls.telegram, 1);
  assert.deepEqual(deliveries, {
    email: {
      attempted: true,
      sent: true,
    },
    telegram: {
      attempted: true,
      sent: false,
      error: "chat not found",
    },
  });
});

test("deliverBriefing throws when all enabled channels fail", async () => {
  await assert.rejects(
    () =>
      deliverBriefing(
        briefingPayloadFixture,
        {
          channels: ["email", "telegram"],
          email: {
            to: "ops@example.com",
          },
          telegram: {
            botToken: "token",
            chatId: "123",
          },
        },
        {
          sendEmail: async () => {
            throw new Error("smtp down");
          },
          sendTelegramMessage: async () => {
            throw new Error("chat not found");
          },
        },
      ),
    /All enabled delivery channels failed/,
  );
});
