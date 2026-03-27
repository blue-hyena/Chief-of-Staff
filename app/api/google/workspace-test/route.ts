import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspaceTestAssets,
  inspectDriveFolder,
} from "@/lib/google-workspace";
import { getAppConfig } from "@/lib/config";

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

  const folderId = request.nextUrl.searchParams.get("folderId");

  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId." }, { status: 400 });
  }

  try {
    return NextResponse.json(await inspectDriveFolder(folderId));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Workspace test failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const config = getAppConfig();

  if (!isAuthorized(request, config.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { folderId?: string };
  const folderId = body.folderId;

  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId." }, { status: 400 });
  }

  try {
    return NextResponse.json(await createWorkspaceTestAssets(folderId));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Workspace creation test failed.",
      },
      { status: 500 },
    );
  }
}
