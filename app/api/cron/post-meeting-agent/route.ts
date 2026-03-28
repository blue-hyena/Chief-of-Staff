import { NextRequest, NextResponse } from "next/server";
import { runPostMeetingAgent } from "@/lib/agent";
import { getAppConfig } from "@/lib/config";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = getAppConfig();

  if (!isAuthorizedCronRequest(request, config.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetDate = request.nextUrl.searchParams.get("date") ?? undefined;
  const dryRun =
    request.nextUrl.searchParams.get("dryRun")?.toLowerCase() === "true";

  try {
    const result = await runPostMeetingAgent({
      targetDate,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected post-meeting agent error";

    return NextResponse.json(
      {
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
