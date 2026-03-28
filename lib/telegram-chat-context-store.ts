import { getSupabaseServerClient } from "@/lib/supabase-server";

export const TELEGRAM_CHAT_CONTEXT_TABLE = "telegram_chat_context";

export type TelegramChatContext = {
  chatId: string;
  lastTargetDate?: string;
  lastQuestion?: string;
  lastIntent?: string;
  lastMeetingTitle?: string;
  updatedAt?: string;
};

type TelegramChatContextRow = {
  chat_id: string;
  last_target_date: string | null;
  last_question: string | null;
  last_intent: string | null;
  last_meeting_title: string | null;
  updated_at: string | null;
};

function isMissingContextTableError(error: { code?: string; message: string }) {
  return error.code === "42P01" || /telegram_chat_context/i.test(error.message);
}

function parseTelegramChatContextRow(row: TelegramChatContextRow | null) {
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    lastTargetDate: row.last_target_date ?? undefined,
    lastQuestion: row.last_question ?? undefined,
    lastIntent: row.last_intent ?? undefined,
    lastMeetingTitle: row.last_meeting_title ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  } satisfies TelegramChatContext;
}

export async function readTelegramChatContext(chatId: number | string) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(TELEGRAM_CHAT_CONTEXT_TABLE)
    .select(
      "chat_id, last_target_date, last_question, last_intent, last_meeting_title, updated_at",
    )
    .eq("chat_id", String(chatId))
    .maybeSingle<TelegramChatContextRow>();

  if (error) {
    if (isMissingContextTableError(error)) {
      return null;
    }

    throw new Error(`Failed to read Telegram chat context: ${error.message}`);
  }

  return parseTelegramChatContextRow(data ?? null);
}

export async function writeTelegramChatContext(
  context: TelegramChatContext,
  now = new Date(),
) {
  const client = getSupabaseServerClient();
  const { error } = await client.from(TELEGRAM_CHAT_CONTEXT_TABLE).upsert(
    {
      chat_id: context.chatId,
      last_target_date: context.lastTargetDate ?? null,
      last_question: context.lastQuestion ?? null,
      last_intent: context.lastIntent ?? null,
      last_meeting_title: context.lastMeetingTitle ?? null,
      updated_at: now.toISOString(),
    },
    {
      onConflict: "chat_id",
    },
  );

  if (error) {
    if (isMissingContextTableError(error)) {
      return;
    }

    throw new Error(`Failed to write Telegram chat context: ${error.message}`);
  }
}
