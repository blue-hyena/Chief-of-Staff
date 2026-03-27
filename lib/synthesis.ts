import { getAppConfig } from "@/lib/config";
import { buildDeterministicDigest } from "@/lib/digest";
import { buildFireworksDigest } from "@/lib/fireworks";
import { BriefingPayload, EventContext } from "@/lib/types";

type SynthesisResult = {
  payload: BriefingPayload;
  usedFallback: boolean;
};

type SynthesisDependencies = {
  buildFireworksDigest?: typeof buildFireworksDigest;
};

export async function buildBriefingPayload(
  targetDate: string,
  meetingContexts: EventContext[],
  dependencies: SynthesisDependencies = {},
): Promise<SynthesisResult> {
  const config = getAppConfig();
  const deterministicPayload = buildDeterministicDigest(targetDate, meetingContexts);

  if (config.briefingSynthesisMode !== "fireworks") {
    return {
      payload: deterministicPayload,
      usedFallback: false,
    };
  }

  if (meetingContexts.length === 0) {
    deterministicPayload.metadata.notes.push(
      "Fireworks synthesis skipped because no meetings were found for the selected day.",
    );

    return {
      payload: deterministicPayload,
      usedFallback: false,
    };
  }

  try {
    const fireworksPayload = await (dependencies.buildFireworksDigest ??
      buildFireworksDigest)({
      apiKey: config.fireworks!.apiKey,
      calendarId: config.googleCalendarId,
      meetingContexts,
      model: config.fireworks!.model,
      targetDate,
      timeoutMs: config.fireworks!.timeoutMs,
      timezone: config.timezone,
    });

    return {
      payload: fireworksPayload,
      usedFallback: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Fireworks synthesis failure";

    deterministicPayload.metadata.notes.push(
      `Fireworks synthesis failed. Used deterministic fallback: ${message}`,
    );

    return {
      payload: deterministicPayload,
      usedFallback: true,
    };
  }
}
