import test from "node:test";
import assert from "node:assert/strict";
import { buildEmailSubject, renderMorningBriefingEmail } from "@/lib/email";
import { briefingPayloadFixture as payload } from "@/tests/fixtures";

test("renderMorningBriefingEmail returns both html and text", () => {
  const email = renderMorningBriefingEmail(payload);

  assert.match(email.html, /Board Prep/);
  assert.match(email.html, /Finalize the talking points/);
  assert.match(email.html, /PM Synthesis/);
  assert.match(email.text, /Top Actions/);
  assert.match(email.text, /Draft opening remarks/);
  assert.match(email.text, /Decisions To Drive/);
});

test("buildEmailSubject includes the display date", () => {
  const subject = buildEmailSubject(payload);

  assert.match(subject, /Morning Briefing:/);
  assert.match(subject, /March/);
});
