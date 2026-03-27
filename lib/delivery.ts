import { buildEmailSubject, renderMorningBriefingEmail } from "@/lib/email";
import { sendEmail } from "@/lib/google-workspace";
import {
  renderTelegramBriefing,
  sendTelegramMessage,
} from "@/lib/telegram";
import {
  BriefingPayload,
  DeliveryChannel,
  DeliveryResults,
} from "@/lib/types";

type DeliveryOptions = {
  channels: DeliveryChannel[];
  dryRun?: boolean;
  email?: {
    to: string;
    replyTo?: string;
  };
  telegram?: {
    botToken: string;
    chatId: string;
  };
};

type DeliveryDependencies = {
  sendEmail: typeof sendEmail;
  sendTelegramMessage: typeof sendTelegramMessage;
};

function buildEmptyResults(): DeliveryResults {
  return {
    email: {
      attempted: false,
      sent: false,
    },
    telegram: {
      attempted: false,
      sent: false,
    },
  };
}

export async function deliverBriefing(
  payload: BriefingPayload,
  options: DeliveryOptions,
  dependencies: DeliveryDependencies = {
    sendEmail,
    sendTelegramMessage,
  },
) {
  const results = buildEmptyResults();

  if (options.dryRun) {
    return results;
  }

  if (options.channels.includes("email")) {
    results.email.attempted = true;

    try {
      if (!options.email) {
        throw new Error("Email delivery is enabled but no email options were provided.");
      }

      const email = renderMorningBriefingEmail(payload);

      await dependencies.sendEmail({
        to: options.email.to,
        replyTo: options.email.replyTo,
        subject: buildEmailSubject(payload),
        html: email.html,
        text: email.text,
      });

      results.email.sent = true;
    } catch (error) {
      results.email.error =
        error instanceof Error ? error.message : "Unknown email delivery error";
    }
  }

  if (options.channels.includes("telegram")) {
    results.telegram.attempted = true;

    try {
      if (!options.telegram) {
        throw new Error(
          "Telegram delivery is enabled but no Telegram options were provided.",
        );
      }

      await dependencies.sendTelegramMessage({
        botToken: options.telegram.botToken,
        chatId: options.telegram.chatId,
        messages: renderTelegramBriefing(payload),
      });

      results.telegram.sent = true;
    } catch (error) {
      results.telegram.error =
        error instanceof Error ? error.message : "Unknown Telegram delivery error";
    }
  }

  const attemptedResults = Object.values(results).filter((result) => result.attempted);

  if (attemptedResults.length > 0 && attemptedResults.every((result) => !result.sent)) {
    const failureSummary = Object.entries(results)
      .filter(([, result]) => result.attempted && result.error)
      .map(([channel, result]) => `${channel}: ${result.error}`)
      .join("; ");

    throw new Error(`All enabled delivery channels failed. ${failureSummary}`);
  }

  return results;
}
