import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { getAppConfig } from "@/lib/config";
import {
  GOOGLE_OAUTH_STORAGE_KEY,
  GOOGLE_OAUTH_TOKENS_TABLE,
  readStoredGoogleOAuth as readStoredOAuthFromStore,
  writeStoredGoogleOAuth as writeStoredOAuthToStore,
  type StoredGoogleOAuth,
} from "@/lib/google-oauth-store";

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

type GoogleOAuthStore = {
  readStoredOAuth: () => Promise<StoredGoogleOAuth | null>;
  writeStoredOAuth: (payload: StoredGoogleOAuth) => Promise<void>;
};

type GoogleOAuthExchangeDependencies = Partial<GoogleOAuthStore> & {
  exchangeCode?: (
    client: ReturnType<typeof getOAuthClient>,
    code: string,
  ) => Promise<Credentials>;
  getUserEmail?: (client: ReturnType<typeof getOAuthClient>) => Promise<string | null>;
};

const defaultGoogleOAuthStore: GoogleOAuthStore = {
  readStoredOAuth: readStoredOAuthFromStore,
  writeStoredOAuth: writeStoredOAuthToStore,
};

export function getGoogleAuthorizationUrl() {
  const client = getOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: OAUTH_SCOPES,
  });
}

export async function getGoogleOAuthStatus(
  dependencies: Partial<GoogleOAuthStore> = {},
) {
  const config = getAppConfig();

  if (config.googleAuthMode !== "oauth") {
    return {
      mode: config.googleAuthMode,
      authorized: false,
      tokensFile: null,
      tokenStore: null,
      userEmail: null,
    };
  }

  const store = {
    ...defaultGoogleOAuthStore,
    ...dependencies,
  };
  const stored = await store.readStoredOAuth();

  return {
    mode: config.googleAuthMode,
    authorized: Boolean(stored?.tokens?.refresh_token || stored?.tokens?.access_token),
    tokensFile: null,
    tokenStore: `${GOOGLE_OAUTH_TOKENS_TABLE}/${GOOGLE_OAUTH_STORAGE_KEY}`,
    userEmail: stored?.userEmail ?? null,
  };
}

export async function exchangeGoogleCode(
  code: string,
  dependencies: GoogleOAuthExchangeDependencies = {},
) {
  const client = getOAuthClient();
  const tokens = dependencies.exchangeCode
    ? await dependencies.exchangeCode(client, code)
    : (await client.getToken(code)).tokens;

  client.setCredentials(tokens);

  const userEmail = dependencies.getUserEmail
    ? await dependencies.getUserEmail(client)
    : (
        await google.oauth2({ version: "v2", auth: client }).userinfo.get()
      ).data.email ?? null;
  const store = {
    ...defaultGoogleOAuthStore,
    ...dependencies,
  };

  await store.writeStoredOAuth({
    tokens,
    userEmail: userEmail ?? undefined,
  });

  return {
    userEmail,
  };
}

export async function getOAuthAuthorizedClient(
  dependencies: Partial<GoogleOAuthStore> = {},
) {
  const store = {
    ...defaultGoogleOAuthStore,
    ...dependencies,
  };
  const stored = await store.readStoredOAuth();

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
