import { NextResponse } from "next/server";
import { getGoogleOAuthStatus } from "@/lib/google-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getGoogleOAuthStatus());
}
