import { NextRequest, NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { processTelegramUpdate } from "@/lib/telegram-assistant";
import { TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      secret: string;
    }>;
  },
) {
  const config = getAppConfig();
  const { secret } = await context.params;

  if (!config.telegramWebhookSecret) {
    return NextResponse.json(
      {
        error: "Telegram webhook secret is not configured.",
      },
      { status: 503 },
    );
  }

  if (secret !== config.telegramWebhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    await processTelegramUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected Telegram webhook error";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
