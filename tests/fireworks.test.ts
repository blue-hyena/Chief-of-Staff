import test from "node:test";
import assert from "node:assert/strict";
import { buildFireworksDigest } from "@/lib/fireworks";
import { eventContextFixture } from "@/tests/fixtures";

test("buildFireworksDigest converts valid Fireworks JSON into a briefing payload", async () => {
  const payload = await buildFireworksDigest(
    {
      apiKey: "fw-test",
      calendarId: "primary",
      meetingContexts: [eventContextFixture],
      model: "accounts/fireworks/models/kimi-k2p5",
      targetDate: "2026-03-25",
      timeoutMs: 1000,
      timezone: "Asia/Manila",
    },
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    executiveSummary:
                      "One board-prep meeting anchors the day and needs a sharper funding narrative.",
                    topActions: [
                      "Tighten the funding story before the call.",
                      "Confirm who will deliver the board narrative.",
                    ],
                    meetings: [
                      {
                        eventId: "evt-1",
                        summary:
                          "Use the board prep to align the funding posture, sequencing, and talking points.",
                        keyPoints: [
                          "Stakeholder alignment on the funding story is still soft.",
                        ],
                        prepNotes: [
                          "Bring the latest revenue and funding posture numbers.",
                        ],
                        risks: [
                          "The board narrative may overstate confidence if alignment stays weak.",
                        ],
                        actionItems: ["Draft the opening framing for the board call."],
                        pmSynthesis: {
                          recommendedTalkingPoints: [
                            "Open with the decision needed and the current funding posture.",
                          ],
                          decisionsToDrive: [
                            "Lock the funding narrative and follow-up owner before the call ends.",
                          ],
                          stakeholderSignals: [
                            "Watch for gaps between internal risk and the upward-facing message.",
                          ],
                        },
                      },
                    ],
                    pmSynthesis: {
                      dailyPriorities: [
                        "Treat the board prep as the day’s highest-stakes alignment point.",
                      ],
                      crossMeetingRisks: [
                        "A weak funding story will spill into every downstream stakeholder update.",
                      ],
                      stakeholderUpdateDraft: [
                        "Today is focused on tightening the board narrative, owners, and funding posture before external discussion.",
                      ],
                    },
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      now: () => new Date("2026-03-24T21:00:00.000Z"),
    },
  );

  assert.equal(payload.meetings[0]?.title, "Board Prep");
  assert.equal(
    payload.meetings[0]?.summary,
    "Use the board prep to align the funding posture, sequencing, and talking points.",
  );
  assert.match(payload.metadata.notes[0] ?? "", /Fireworks/);
});

test("buildFireworksDigest rejects Fireworks output that omits a meeting", async () => {
  await assert.rejects(
    () =>
      buildFireworksDigest(
        {
          apiKey: "fw-test",
          calendarId: "primary",
          meetingContexts: [eventContextFixture],
          model: "accounts/fireworks/models/kimi-k2p5",
          targetDate: "2026-03-25",
          timeoutMs: 1000,
          timezone: "Asia/Manila",
        },
        {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        executiveSummary: "summary",
                        topActions: ["one"],
                        meetings: [],
                        pmSynthesis: {
                          dailyPriorities: ["one"],
                          crossMeetingRisks: ["one"],
                          stakeholderUpdateDraft: ["one"],
                        },
                      }),
                    },
                  },
                ],
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            ),
        },
      ),
    /omitted eventId/,
  );
});
