import { NextRequest, NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { runMorningBriefing } from "@/lib/briefing";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest, secret: string) {
  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  if (headerSecret === secret) {
    return true;
  }

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length) === secret;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const config = getAppConfig();

  if (!isAuthorized(request, config.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetDate = request.nextUrl.searchParams.get("date") ?? undefined;
  const dryRun =
    request.nextUrl.searchParams.get("dryRun")?.toLowerCase() === "true";

  try {
    const result = await runMorningBriefing({
      targetDate,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected briefing error";

    return NextResponse.json(
      {
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
