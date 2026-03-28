import { Credentials } from "google-auth-library";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const GOOGLE_OAUTH_TOKENS_TABLE = "google_oauth_tokens";
export const GOOGLE_OAUTH_STORAGE_KEY = "default";

export type StoredGoogleOAuth = {
  tokens: Credentials;
  userEmail?: string;
};

type GoogleOAuthRow = {
  storage_key: string;
  user_email: string | null;
  tokens: unknown;
  created_at?: string;
  updated_at?: string;
};

export function parseStoredGoogleOAuthRow(row: GoogleOAuthRow | null) {
  if (!row) {
    return null;
  }

  if (!row.tokens || typeof row.tokens !== "object" || Array.isArray(row.tokens)) {
    throw new Error("Stored Google OAuth row is missing a valid tokens object.");
  }

  return {
    tokens: row.tokens as Credentials,
    userEmail: row.user_email ?? undefined,
  } satisfies StoredGoogleOAuth;
}

export function buildStoredGoogleOAuthRow(
  payload: StoredGoogleOAuth,
  now = new Date(),
) {
  return {
    storage_key: GOOGLE_OAUTH_STORAGE_KEY,
    user_email: payload.userEmail ?? null,
    tokens: payload.tokens,
    updated_at: now.toISOString(),
  };
}

export async function readStoredGoogleOAuth() {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(GOOGLE_OAUTH_TOKENS_TABLE)
    .select("storage_key, user_email, tokens, created_at, updated_at")
    .eq("storage_key", GOOGLE_OAUTH_STORAGE_KEY)
    .maybeSingle<GoogleOAuthRow>();

  if (error) {
    throw new Error(`Failed to read Google OAuth tokens from Supabase: ${error.message}`);
  }

  return parseStoredGoogleOAuthRow(data ?? null);
}

export async function writeStoredGoogleOAuth(
  payload: StoredGoogleOAuth,
  now = new Date(),
) {
  const client = getSupabaseServerClient();
  const { error } = await client
    .from(GOOGLE_OAUTH_TOKENS_TABLE)
    .upsert(buildStoredGoogleOAuthRow(payload, now), {
      onConflict: "storage_key",
    });

  if (error) {
    throw new Error(`Failed to write Google OAuth tokens to Supabase: ${error.message}`);
  }
}
