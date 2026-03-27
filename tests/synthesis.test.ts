import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefingPayload } from "@/lib/synthesis";
import { BriefingPayload } from "@/lib/types";
import { eventContextFixture } from "@/tests/fixtures";
import { resetAppConfigForTests } from "@/lib/config";

const baseEnv = {
  APP_TIMEZONE: "Asia/Manila",
  CRON_SECRET: "secret",
  GOOGLE_AUTH_MODE: "oauth",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
};

test("buildBriefingPayload uses Fireworks synthesis when enabled", async () => {
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

    const fireworksPayload: BriefingPayload = {
      date: "2026-03-25",
      executiveSummary: "Fireworks summary",
      topActions: ["Action from Fireworks"],
      meetings: [
        {
          eventId: eventContextFixture.eventId,
          title: eventContextFixture.title,
          start: eventContextFixture.start,
          end: eventContextFixture.end,
          participants: ["Alex", "Jamie"],
          summary: "Fireworks meeting summary",
          keyPoints: ["Fireworks key point"],
          prepNotes: ["Fireworks prep note"],
          risks: ["Fireworks risk"],
          actionItems: ["Fireworks action"],
          sourceReferences: ["Board Memo"],
          pmSynthesis: {
            recommendedTalkingPoints: ["Fireworks talking point"],
            decisionsToDrive: ["Fireworks decision"],
            stakeholderSignals: ["Fireworks signal"],
          },
        },
      ],
      pmSynthesis: {
        dailyPriorities: ["Fireworks daily priority"],
        crossMeetingRisks: ["Fireworks cross-meeting risk"],
        stakeholderUpdateDraft: ["Fireworks update draft"],
      },
      metadata: {
        calendarId: "primary",
        timezone: "Asia/Manila",
        generatedAt: "2026-03-24T21:00:00.000Z",
        notes: ["Synthesis mode: Fireworks via accounts/fireworks/models/kimi-k2p5."],
      },
    };

    const result = await buildBriefingPayload("2026-03-25", [eventContextFixture], {
      buildFireworksDigest: async () => fireworksPayload,
    });

    assert.equal(result.usedFallback, false);
    assert.equal(result.payload.executiveSummary, "Fireworks summary");
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("buildBriefingPayload falls back to deterministic when Fireworks fails", async () => {
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

    const result = await buildBriefingPayload("2026-03-25", [eventContextFixture], {
      buildFireworksDigest: async () => {
        throw new Error("timeout");
      },
    });

    assert.equal(result.usedFallback, true);
    assert.match(
      result.payload.metadata.notes.join(" "),
      /Fireworks synthesis failed\. Used deterministic fallback: timeout/,
    );
    assert.match(result.payload.metadata.notes.join(" "), /Synthesis mode: deterministic/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});
