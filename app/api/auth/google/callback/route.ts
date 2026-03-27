import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Missing OAuth code." }, { status: 400 });
  }

  const result = await exchangeGoogleCode(code);

  return new NextResponse(
    [
      "<!DOCTYPE html>",
      "<html><body style=\"font-family: sans-serif; padding: 32px;\">",
      "<h1>Google Connected</h1>",
      `<p>Authorized account: ${result.userEmail ?? "unknown"}</p>`,
      "<p>You can close this tab and return to the app.</p>",
      "</body></html>",
    ].join(""),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
