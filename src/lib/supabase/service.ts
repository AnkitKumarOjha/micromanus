import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

// Service-role Supabase client. BYPASSES RLS — only ever import this in
// server-only code (route handlers / server actions) for privileged operations
// that must not be client-forgeable: crediting accounts, redeeming coupons,
// processing webhooks, writing usage logs and artifacts.
// Never expose the service-role key or this client to the browser.
export function createSupabaseServiceClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
