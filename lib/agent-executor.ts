import {
  getActionProposalById,
  updateActionProposalStatus,
} from "@/lib/agent-store";
import { getAppConfig } from "@/lib/config";
import {
  appendRowsToSheet,
  createGoogleDoc,
  sendEmail,
} from "@/lib/google-workspace";
import { sendTelegramText } from "@/lib/telegram";
import { ActionProposal } from "@/lib/types";

type ExecuteActionProposalDependencies = {
  sendEmail?: typeof sendEmail;
  sendTelegramText?: typeof sendTelegramText;
  createGoogleDoc?: typeof createGoogleDoc;
  appendRowsToSheet?: typeof appendRowsToSheet;
};

function getPendingProposal(
  proposal: ActionProposal | null,
  proposalId: string,
): ActionProposal {
  if (!proposal) {
    throw new Error(`Proposal ${proposalId} was not found.`);
  }

  if (proposal.status !== "pending") {
    throw new Error(`Proposal ${proposalId} is ${proposal.status} and cannot be approved.`);
  }

  return proposal;
}

export async function rejectActionProposal(proposalId: string) {
  const proposal = await getActionProposalById(proposalId);

  if (!proposal) {
    throw new Error(`Proposal ${proposalId} was not found.`);
  }

  if (proposal.status !== "pending") {
    throw new Error(`Proposal ${proposalId} is ${proposal.status} and cannot be rejected.`);
  }

  return updateActionProposalStatus({
    proposalId,
    status: "rejected",
  });
}

export async function executeActionProposal(
  proposalId: string,
  dependencies: ExecuteActionProposalDependencies = {},
) {
  const config = getAppConfig();
  const proposal = getPendingProposal(
    await getActionProposalById(proposalId),
    proposalId,
  );

  const approvedAt = new Date().toISOString();
  await updateActionProposalStatus({
    proposalId,
    status: "approved",
    approvedAt,
  });

  try {
    if (proposal.kind === "send_email") {
      await (dependencies.sendEmail ?? sendEmail)({
        to: proposal.payload.to.join(", "),
        subject: proposal.payload.subject,
        text: proposal.payload.text,
        html:
          proposal.payload.html ??
          `<html><body style="font-family: sans-serif; white-space: pre-wrap;">${proposal.payload.text}</body></html>`,
        replyTo: proposal.payload.replyTo,
      });
    } else if (proposal.kind === "send_telegram_message") {
      const chatId = proposal.payload.chatId ?? config.telegram?.chatId;

      if (!chatId) {
        throw new Error("No Telegram chat ID is configured for this proposal.");
      }

      const botToken = config.telegram?.botToken ?? config.telegramBotToken;

      if (!botToken) {
        throw new Error("Telegram bot token is not configured.");
      }

      await (dependencies.sendTelegramText ?? sendTelegramText)({
        botToken,
        chatId,
        text: proposal.payload.message,
      });
    } else if (proposal.kind === "create_google_doc") {
      const folderId = proposal.payload.folderId ?? config.agent.googleDocFolderId;

      if (!folderId) {
        throw new Error("No Google Doc folder ID is configured for this proposal.");
      }

      await (dependencies.createGoogleDoc ?? createGoogleDoc)({
        folderId,
        title: proposal.payload.title,
        body: proposal.payload.body,
      });
    } else if (proposal.kind === "update_google_sheet") {
      const spreadsheetId =
        proposal.payload.spreadsheetId ?? config.agent.googleTrackerSpreadsheetId;

      if (!spreadsheetId) {
        throw new Error("No Google tracker spreadsheet ID is configured for this proposal.");
      }

      await (dependencies.appendRowsToSheet ?? appendRowsToSheet)({
        spreadsheetId,
        sheetName: proposal.payload.sheetName,
        rows: proposal.payload.rows,
      });
    }

    return await updateActionProposalStatus({
      proposalId,
      status: "executed",
      approvedAt,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown action proposal failure";

    await updateActionProposalStatus({
      proposalId,
      status: "failed",
      approvedAt,
      executionError: message,
    });

    throw error;
  }
}
