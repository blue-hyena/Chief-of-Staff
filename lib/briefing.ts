import { getAppConfig } from "@/lib/config";
import { deliverBriefing } from "@/lib/delivery";
import { listEventContextsForDate } from "@/lib/google-workspace";
import { buildBriefingPayload } from "@/lib/synthesis";
import { getLocalDateString } from "@/lib/time";
import {
  BriefingPayload,
  RunMorningBriefingOptions,
  RunMorningBriefingResult,
} from "@/lib/types";

function addOperationalNotes(payload: BriefingPayload, meetingContexts: Awaited<ReturnType<typeof listEventContextsForDate>>) {
  const extractionNotes = meetingContexts
    .flatMap((event) =>
      event.attachments
        .filter((attachment) => Boolean(attachment.extractionError))
        .map(
          (attachment) =>
            `${event.title}: ${attachment.title} could not be fully processed (${attachment.extractionError}).`,
        ),
    )
    .slice(0, 8);

  payload.metadata.notes.push(...extractionNotes);
  return payload;
}

export async function runMorningBriefing(
  options: RunMorningBriefingOptions = {},
): Promise<RunMorningBriefingResult> {
  const config = getAppConfig();
  const targetDate =
    options.targetDate ?? getLocalDateString(new Date(), config.timezone);
  const meetingContexts = await listEventContextsForDate(targetDate);

  if (meetingContexts.length === 0 && !config.briefingSendIfEmpty) {
    const { payload } = await buildBriefingPayload(targetDate, meetingContexts);
    payload.metadata.notes.push(
      "No meetings found. Briefing delivery was suppressed by BRIEFING_SEND_IF_EMPTY=false.",
    );

    return {
      ok: true,
      targetDate,
      meetingCount: 0,
      deliveries: {
        email: {
          attempted: false,
          sent: false,
        },
        telegram: {
          attempted: false,
          sent: false,
        },
      },
      usedFallback: false,
      payload,
    };
  }

  const { payload, usedFallback } = await buildBriefingPayload(
    targetDate,
    meetingContexts,
  );

  addOperationalNotes(payload, meetingContexts);

  const deliveries = await deliverBriefing(payload, {
    channels: config.briefingDeliveryChannels,
    dryRun: options.dryRun,
    email: config.briefingRecipientEmail
      ? {
          to: config.briefingRecipientEmail,
          replyTo: config.briefingReplyTo,
        }
      : undefined,
    telegram: config.telegram,
  });

  return {
    ok: true,
    targetDate,
    meetingCount: meetingContexts.length,
    deliveries,
    usedFallback,
    payload,
  };
}
