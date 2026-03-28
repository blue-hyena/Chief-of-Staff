import { NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest, secret: string) {
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
