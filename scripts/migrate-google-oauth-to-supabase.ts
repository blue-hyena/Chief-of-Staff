import fs from "node:fs";
import { getAppConfig } from "@/lib/config";
import {
  GOOGLE_OAUTH_STORAGE_KEY,
  parseStoredGoogleOAuthRow,
  writeStoredGoogleOAuth,
} from "@/lib/google-oauth-store";

async function main() {
  const config = getAppConfig();

  if (config.googleAuthMode !== "oauth" || !config.oauth) {
    throw new Error("This migration only applies when GOOGLE_AUTH_MODE=oauth.");
  }

  if (!fs.existsSync(config.oauth.legacyTokensFile)) {
    throw new Error(
      `Google OAuth token file not found at ${config.oauth.legacyTokensFile}.`,
    );
  }

  const raw = fs.readFileSync(config.oauth.legacyTokensFile, "utf8");
  const parsed = JSON.parse(raw) as {
    tokens?: unknown;
    userEmail?: string | null;
  };
  const stored = parseStoredGoogleOAuthRow({
    storage_key: GOOGLE_OAUTH_STORAGE_KEY,
    user_email: parsed.userEmail ?? null,
    tokens: parsed.tokens,
  });

  if (!stored) {
    throw new Error("Google OAuth token file did not contain a stored OAuth payload.");
  }

  await writeStoredGoogleOAuth(stored);

  console.log(
    `Migrated Google OAuth tokens to Supabase for ${stored.userEmail ?? "unknown user"}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
