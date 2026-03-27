import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { getAppConfig } from "@/lib/config";

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

type StoredGoogleOAuth = {
  tokens: Credentials;
  userEmail?: string;
};

function ensureOAuthConfig() {
  const config = getAppConfig();

  if (config.googleAuthMode !== "oauth" || !config.oauth) {
    throw new Error("Google OAuth is not enabled.");
  }

  return config.oauth;
}

function getOAuthClient() {
  const oauth = ensureOAuthConfig();
  return new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri,
  );
}

function readStoredOAuth() {
  const oauth = ensureOAuthConfig();

  if (!fs.existsSync(oauth.tokensFile)) {
    return null;
  }

  const raw = fs.readFileSync(oauth.tokensFile, "utf8");
  return JSON.parse(raw) as StoredGoogleOAuth;
}

function writeStoredOAuth(payload: StoredGoogleOAuth) {
  const oauth = ensureOAuthConfig();
  fs.writeFileSync(oauth.tokensFile, JSON.stringify(payload, null, 2));
}

export function getGoogleAuthorizationUrl() {
  const client = getOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: OAUTH_SCOPES,
  });
}

export function getGoogleOAuthStatus() {
  const config = getAppConfig();

  if (config.googleAuthMode !== "oauth") {
    return {
      mode: config.googleAuthMode,
      authorized: false,
      tokensFile: null,
      userEmail: null,
    };
  }

  const stored = readStoredOAuth();

  return {
    mode: config.googleAuthMode,
    authorized: Boolean(stored?.tokens?.refresh_token || stored?.tokens?.access_token),
    tokensFile: path.relative(process.cwd(), config.oauth!.tokensFile),
    userEmail: stored?.userEmail ?? null,
  };
}

export async function exchangeGoogleCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const user = await oauth2.userinfo.get();

  writeStoredOAuth({
    tokens,
    userEmail: user.data.email ?? undefined,
  });

  return {
    userEmail: user.data.email ?? null,
  };
}

export async function getOAuthAuthorizedClient() {
  const stored = readStoredOAuth();

  if (!stored?.tokens) {
    throw new Error(
      "Google OAuth tokens not found. Visit /api/auth/google/start to authorize this app.",
    );
  }

  const client = getOAuthClient();
  client.setCredentials(stored.tokens);

  return {
    auth: client,
    userEmail: stored.userEmail,
  };
}
