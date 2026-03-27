import { NextResponse } from "next/server";
import { getGoogleAuthorizationUrl } from "@/lib/google-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.redirect(getGoogleAuthorizationUrl());
}
