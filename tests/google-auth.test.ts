import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeGoogleCode,
  getGoogleOAuthStatus,
  getOAuthAuthorizedClient,
} from "@/lib/google-auth";
import { resetAppConfigForTests } from "@/lib/config";

const baseEnv = {
  APP_TIMEZONE: "Asia/Manila",
  CRON_SECRET: "secret",
  GOOGLE_AUTH_MODE: "oauth",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  BRIEFING_RECIPIENT_EMAIL: "ops@example.com",
};

test("getGoogleOAuthStatus reports unauthorized when Supabase has no row", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
    };
    resetAppConfigForTests();

    const status = await getGoogleOAuthStatus({
      readStoredOAuth: async () => null,
    });

    assert.equal(status.authorized, false);
    assert.equal(status.userEmail, null);
    assert.match(status.tokenStore ?? "", /google_oauth_tokens\/default/);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("exchangeGoogleCode stores tokens and email through the configured store", async () => {
  const originalEnv = process.env;
  const writes: Array<{
    userEmail?: string;
    tokens: Record<string, unknown>;
  }> = [];

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
    };
    resetAppConfigForTests();

    const result = await exchangeGoogleCode("auth-code", {
      exchangeCode: async () => ({
        access_token: "access",
        refresh_token: "refresh",
      }),
      getUserEmail: async () => "ops@example.com",
      writeStoredOAuth: async (payload) => {
        writes.push({
          userEmail: payload.userEmail,
          tokens: payload.tokens as Record<string, unknown>,
        });
      },
    });

    assert.equal(result.userEmail, "ops@example.com");
    assert.deepEqual(writes, [
      {
        userEmail: "ops@example.com",
        tokens: {
          access_token: "access",
          refresh_token: "refresh",
        },
      },
    ]);
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});

test("getOAuthAuthorizedClient uses stored Supabase tokens", async () => {
  const originalEnv = process.env;

  try {
    process.env = {
      ...originalEnv,
      ...baseEnv,
    };
    resetAppConfigForTests();

    const result = await getOAuthAuthorizedClient({
      readStoredOAuth: async () => ({
        userEmail: "ops@example.com",
        tokens: {
          access_token: "access",
          refresh_token: "refresh",
        },
      }),
    });

    assert.equal(result.userEmail, "ops@example.com");
    assert.equal(typeof result.auth.setCredentials, "function");
    assert.deepEqual(result.auth.credentials, {
      access_token: "access",
      refresh_token: "refresh",
    });
  } finally {
    process.env = originalEnv;
    resetAppConfigForTests();
  }
});
