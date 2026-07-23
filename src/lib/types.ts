// Shared row/domain types. These mirror the Postgres schema in
// supabase/migrations/0001_init.sql. Supabase clients here are untyped, so we
// cast query results to these shapes at call sites.

export type Provider = "anthropic" | "openai" | "moonshot" | "custom";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  paywall_unlocked: boolean;
  coupon_redeemed: boolean;
  credits_balance: number;
  created_at: string;
}

export interface LlmCredential {
  id: string;
  user_id: string;
  provider: Provider;
  label: string | null;
  api_key_encrypted: string;
  base_url: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  provider: Provider;
  model_id: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface DbMessage {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string | null;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  sequence_number: number;
  created_at: string;
}

export interface UsageLog {
  id: string;
  chat_id: string;
  message_id: string | null;
  user_id: string;
  provider: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_input_usd: number;
  cost_output_usd: number;
  cost_cache_usd: number;
  cost_total_usd: number;
  created_at: string;
}

export interface Artifact {
  id: string;
  chat_id: string;
  message_id: string | null;
  type: string;
  storage_path: string;
  title: string | null;
  created_at: string;
}

export interface ModelPricing {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  cache_read_price_per_mtok: number;
  cache_write_price_per_mtok: number;
  context_window: number | null;
  is_active: boolean;
}

// ---- Agent-loop step trace events (streamed to the UI over SSE) ----
export type AgentStep =
  | { type: "status"; text: string }
  | { type: "tool_call"; tool: string; label: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; label: string; summary: string }
  | { type: "assistant_delta"; text: string }
  | { type: "assistant_final"; text: string }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      downloadUrl: string;
    }
  | { type: "usage"; inputTokens: number; outputTokens: number; costTotalUsd: number }
  | { type: "credits"; balance: number }
  | { type: "error"; message: string }
  | { type: "done" };
