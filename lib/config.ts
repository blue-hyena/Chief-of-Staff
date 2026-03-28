import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BriefingSynthesisMode, DeliveryChannel } from "@/lib/types";

const VALID_DELIVERY_CHANNELS: DeliveryChannel[] = ["email", "telegram"];

const EnvSchema = z.object({
  APP_TIMEZONE: z.string().default("Asia/Manila"),
  CRON_SECRET: z.string().min(1),
  GOOGLE_AUTH_MODE: z.enum(["oauth", "service_account"]).default("oauth"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_OAUTH_TOKENS_FILE: z.string().default("./.google-oauth-tokens.json"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_DELEGATED_USER: z.string().email().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  BRIEFING_SYNTHESIS_MODE: z
    .enum(["deterministic", "fireworks"])
    .default("deterministic"),
  BRIEFING_DELIVERY_CHANNELS: z.string().default("email"),
  BRIEFING_RECIPIENT_EMAIL: z.string().email().optional(),
  BRIEFING_REPLY_TO: z.string().email().optional().or(z.literal("")),
  BRIEFING_SEND_IF_EMPTY: z.enum(["true", "false"]).default("true"),
  FIREWORKS_API_KEY: z.string().optional(),
  FIREWORKS_MODEL: z
    .string()
    .default("accounts/fireworks/models/kimi-k2p5"),
  FIREWORKS_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  MAX_MEETINGS_PER_BRIEFING: z.coerce.number().int().positive().default(8),
  MAX_ATTACHMENTS_PER_EVENT: z.coerce.number().int().positive().default(5),
  MAX_DOCUMENT_CHARS: z.coerce.number().int().positive().default(12000),
});

type AppEnv = z.infer<typeof EnvSchema>;

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  legacyTokensFile: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export type AppConfig = {
  timezone: string;
  cronSecret: string;
  googleAuthMode: "oauth" | "service_account";
  googleDelegatedUser: string;
  googleCalendarId: string;
  briefingSynthesisMode: BriefingSynthesisMode;
  briefingDeliveryChannels: DeliveryChannel[];
  briefingRecipientEmail?: string;
  briefingReplyTo?: string;
  briefingSendIfEmpty: boolean;
  maxMeetingsPerBriefing: number;
  maxAttachmentsPerEvent: number;
  maxDocumentChars: number;
  telegramBotToken?: string;
  telegram?: {
    botToken: string;
    chatId: string;
  };
  telegramWebhookSecret?: string;
  fireworks?: {
    apiKey: string;
    model: string;
    timeoutMs: number;
  };
  oauth?: GoogleOAuthConfig;
  serviceAccount?: ServiceAccountCredentials;
};

let cachedConfig: AppConfig | null = null;

function parseDeliveryChannels(rawValue: string) {
  const channels = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (channels.length === 0) {
    throw new Error(
      "BRIEFING_DELIVERY_CHANNELS must include at least one channel: email or telegram.",
    );
  }

  const deduped = [...new Set(channels)];
  const invalid = deduped.filter(
    (channel): channel is string =>
      !VALID_DELIVERY_CHANNELS.includes(channel as DeliveryChannel),
  );

  if (invalid.length > 0) {
    throw new Error(
      `Invalid BRIEFING_DELIVERY_CHANNELS value: ${invalid.join(", ")}.`,
    );
  }

  return deduped as DeliveryChannel[];
}

function resolveCredentialPayload(env: AppEnv) {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    return Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString(
      "utf8",
    );
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const resolvedPath = path.resolve(process.cwd(), env.GOOGLE_SERVICE_ACCOUNT_FILE);
    return fs.readFileSync(resolvedPath, "utf8");
  }

  throw new Error(
    "Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
  );
}

function parseServiceAccount(rawValue: string): ServiceAccountCredentials {
  const parsed = JSON.parse(rawValue) as {
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google service account payload is missing client_email or private_key.");
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function getConfigStatus() {
  const authMode =
    process.env.GOOGLE_AUTH_MODE === "service_account"
      ? "service_account"
      : "oauth";
  const synthesisMode =
    process.env.BRIEFING_SYNTHESIS_MODE === "fireworks"
      ? "fireworks"
      : "deterministic";
  let deliveryChannels: DeliveryChannel[] = ["email"];

  try {
    deliveryChannels = parseDeliveryChannels(
      process.env.BRIEFING_DELIVERY_CHANNELS ?? "email",
    );
  } catch {
    // Fall back so the home page can still show basic config status.
  }
  const requiredKeys =
    authMode === "oauth"
      ? [
          "CRON_SECRET",
          "GOOGLE_OAUTH_CLIENT_ID",
          "GOOGLE_OAUTH_CLIENT_SECRET",
          "GOOGLE_OAUTH_REDIRECT_URI",
          "SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ]
      : [
          "CRON_SECRET",
          "GOOGLE_DELEGATED_USER",
        ];
  const deliveryKeys = [
    "BRIEFING_SYNTHESIS_MODE",
    ...(synthesisMode === "fireworks"
      ? ["FIREWORKS_API_KEY", "FIREWORKS_MODEL"]
      : []),
    "BRIEFING_DELIVERY_CHANNELS",
    ...(deliveryChannels.includes("email") ? ["BRIEFING_RECIPIENT_EMAIL"] : []),
    ...(deliveryChannels.includes("telegram")
      ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
      : []),
  ];

  return [...requiredKeys, ...deliveryKeys].map((key) => ({
    key,
    present: Boolean(process.env[key]),
  }));
}

export function getAppConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = EnvSchema.parse(process.env);
  const googleAuthMode = env.GOOGLE_AUTH_MODE;
  const briefingDeliveryChannels = parseDeliveryChannels(
    env.BRIEFING_DELIVERY_CHANNELS,
  );
  const briefingSynthesisMode = env.BRIEFING_SYNTHESIS_MODE;
  const serviceAccount =
    googleAuthMode === "service_account"
      ? parseServiceAccount(resolveCredentialPayload(env))
      : undefined;
  const oauth =
    googleAuthMode === "oauth"
      ? {
          clientId:
            env.GOOGLE_OAUTH_CLIENT_ID ??
            (() => {
              throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID.");
            })(),
          clientSecret:
            env.GOOGLE_OAUTH_CLIENT_SECRET ??
            (() => {
              throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET.");
            })(),
          redirectUri:
            env.GOOGLE_OAUTH_REDIRECT_URI ??
            (() => {
              throw new Error("Missing GOOGLE_OAUTH_REDIRECT_URI.");
            })(),
          legacyTokensFile: path.resolve(
            process.cwd(),
            env.GOOGLE_OAUTH_TOKENS_FILE,
          ),
          supabaseUrl:
            env.SUPABASE_URL ??
            (() => {
              throw new Error("Missing SUPABASE_URL.");
            })(),
          supabaseServiceRoleKey:
            env.SUPABASE_SERVICE_ROLE_KEY ??
            (() => {
              throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
            })(),
        }
      : undefined;
  const googleDelegatedUser =
    googleAuthMode === "service_account"
      ? env.GOOGLE_DELEGATED_USER ??
        (() => {
          throw new Error("Missing GOOGLE_DELEGATED_USER for service account mode.");
        })()
      : "";
  const briefingRecipientEmail = briefingDeliveryChannels.includes("email")
    ? env.BRIEFING_RECIPIENT_EMAIL ??
      (() => {
        throw new Error(
          "Missing BRIEFING_RECIPIENT_EMAIL while email delivery is enabled.",
        );
      })()
    : undefined;
  const telegram = briefingDeliveryChannels.includes("telegram")
    ? {
        botToken:
          env.TELEGRAM_BOT_TOKEN ??
          (() => {
            throw new Error(
              "Missing TELEGRAM_BOT_TOKEN while Telegram delivery is enabled.",
            );
          })(),
        chatId:
          env.TELEGRAM_CHAT_ID ??
          (() => {
            throw new Error(
              "Missing TELEGRAM_CHAT_ID while Telegram delivery is enabled.",
            );
          })(),
      }
    : undefined;
  const fireworks =
    briefingSynthesisMode === "fireworks"
      ? {
          apiKey:
            env.FIREWORKS_API_KEY ??
            (() => {
              throw new Error(
                "Missing FIREWORKS_API_KEY while Fireworks synthesis is enabled.",
              );
            })(),
          model: env.FIREWORKS_MODEL,
          timeoutMs: env.FIREWORKS_TIMEOUT_MS,
        }
      : undefined;

  cachedConfig = {
    timezone: env.APP_TIMEZONE,
    cronSecret: env.CRON_SECRET,
    googleAuthMode,
    googleDelegatedUser,
    googleCalendarId: env.GOOGLE_CALENDAR_ID,
    briefingSynthesisMode,
    briefingDeliveryChannels,
    briefingRecipientEmail,
    briefingReplyTo: env.BRIEFING_REPLY_TO || undefined,
    briefingSendIfEmpty: env.BRIEFING_SEND_IF_EMPTY === "true",
    maxMeetingsPerBriefing: env.MAX_MEETINGS_PER_BRIEFING,
    maxAttachmentsPerEvent: env.MAX_ATTACHMENTS_PER_EVENT,
    maxDocumentChars: env.MAX_DOCUMENT_CHARS,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegram,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    fireworks,
    oauth,
    serviceAccount,
  };

  return cachedConfig;
}

export function resetAppConfigForTests() {
  cachedConfig = null;
}
