// Centralised, typed access to server-side environment variables.
// Throws a clear error at call time if a required var is missing, so failures
// are readable instead of surfacing as "undefined" deep in a request.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example / the README runbook.`,
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const serverEnv = {
  get siteUrl() {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000"
    );
  },
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get dodoApiKey() {
    return required("DODO_PAYMENTS_API_KEY");
  },
  get dodoWebhookSecret() {
    return required("DODO_PAYMENTS_WEBHOOK_SECRET");
  },
  get dodoEnvironment() {
    return optional("DODO_PAYMENTS_ENVIRONMENT", "live_mode");
  },
  get dodoProductId() {
    return required("DODO_PRODUCT_ID_5_CREDITS");
  },
  // Search keys are optional — the search module falls back to a no-key
  // DuckDuckGo provider when neither Tavily nor Brave is configured.
  get tavilyApiKey() {
    return optional("TAVILY_API_KEY");
  },
  get braveApiKey() {
    return optional("BRAVE_SEARCH_API_KEY");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get couponCode() {
    return optional("PAYWALL_COUPON_CODE", "SID_DRDROID");
  },
};

export const CREDITS_PER_UNLOCK = 5;
export const CREDIT_PRICE_CENTS = 500; // $5.00
export const MAX_AGENT_ITERATIONS = 12;
