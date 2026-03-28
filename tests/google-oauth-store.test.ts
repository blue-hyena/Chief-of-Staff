import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_OAUTH_STORAGE_KEY,
  buildStoredGoogleOAuthRow,
  parseStoredGoogleOAuthRow,
} from "@/lib/google-oauth-store";

test("parseStoredGoogleOAuthRow returns null for missing data", () => {
  assert.equal(parseStoredGoogleOAuthRow(null), null);
});

test("parseStoredGoogleOAuthRow converts a Supabase row into stored OAuth state", () => {
  const stored = parseStoredGoogleOAuthRow({
    storage_key: GOOGLE_OAUTH_STORAGE_KEY,
    user_email: "ops@example.com",
    tokens: {
      access_token: "access",
      refresh_token: "refresh",
      expiry_date: 123,
    },
  });

  assert.deepEqual(stored, {
    userEmail: "ops@example.com",
    tokens: {
      access_token: "access",
      refresh_token: "refresh",
      expiry_date: 123,
    },
  });
});

test("parseStoredGoogleOAuthRow rejects malformed token payloads", () => {
  assert.throws(
    () =>
      parseStoredGoogleOAuthRow({
        storage_key: GOOGLE_OAUTH_STORAGE_KEY,
        user_email: null,
        tokens: "bad",
      }),
    /valid tokens object/,
  );
});

test("buildStoredGoogleOAuthRow builds a stable upsert payload", () => {
  const row = buildStoredGoogleOAuthRow(
    {
      userEmail: "ops@example.com",
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
      },
    },
    new Date("2026-03-28T15:00:00.000Z"),
  );

  assert.deepEqual(row, {
    storage_key: GOOGLE_OAUTH_STORAGE_KEY,
    user_email: "ops@example.com",
    tokens: {
      access_token: "access",
      refresh_token: "refresh",
    },
    updated_at: "2026-03-28T15:00:00.000Z",
  });
});
