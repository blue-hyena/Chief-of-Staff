import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/config";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServerClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getAppConfig();

  if (config.googleAuthMode !== "oauth" || !config.oauth) {
    throw new Error("Supabase server client is only configured for Google OAuth mode.");
  }

  cachedClient = createClient(
    config.oauth.supabaseUrl,
    config.oauth.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return cachedClient;
}

export function resetSupabaseServerClientForTests() {
  cachedClient = null;
}
