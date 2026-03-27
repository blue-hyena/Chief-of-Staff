import test from "node:test";
import assert from "node:assert/strict";
import { renderTelegramBriefing } from "@/lib/telegram";
import { briefingPayloadFixture } from "@/tests/fixtures";

test("renderTelegramBriefing returns compact sections", () => {
  const messages = renderTelegramBriefing(briefingPayloadFixture);

  assert.equal(messages.length, 1);
  assert.match(messages[0], /Morning Briefing -/);
  assert.match(messages[0], /Top Actions/);
  assert.match(messages[0], /PM Synthesis/);
  assert.match(messages[0], /Board Prep/);
  assert.match(messages[0], /Draft opening remarks/);
});

test("renderTelegramBriefing splits oversized messages within Telegram limits", () => {
  const messages = renderTelegramBriefing({
    ...briefingPayloadFixture,
    topActions: Array.from({ length: 160 }, (_, index) => `Action ${index + 1} ` + "detail ".repeat(14)),
  });

  assert.ok(messages.length > 1);

  for (const message of messages) {
    assert.ok(message.length <= 4000);
  }
});
