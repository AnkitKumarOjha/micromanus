import type { Provider } from "./types";

// Config mirror of the model_pricing seed, used for the new-chat model picker
// and for provider defaults. Pricing itself is looked up from the DB at
// usage-log time (see lib/pricing.ts) — this list only drives selection/labels.

export interface ProviderConfig {
  id: Provider;
  label: string;
  // Whether the user must supply a base URL (true only for "custom").
  requiresBaseUrl: boolean;
  defaultBaseUrl?: string;
  keyPlaceholder: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    requiresBaseUrl: false,
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
  },
  {
    id: "moonshot",
    label: "Kimi (Moonshot)",
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    keyPlaceholder: "sk-...",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    requiresBaseUrl: true,
    keyPlaceholder: "your-api-key",
  },
];

export interface ModelOption {
  provider: Provider;
  modelId: string;
  displayName: string;
}

// Models selectable for chats. `custom` has no fixed catalogue — the user
// types the model id when creating the chat.
export const MODELS: ModelOption[] = [
  // Anthropic
  { provider: "anthropic", modelId: "claude-sonnet-5", displayName: "Claude Sonnet 5" },
  { provider: "anthropic", modelId: "claude-opus-4-8", displayName: "Claude Opus 4.8" },
  { provider: "anthropic", modelId: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5" },
  { provider: "anthropic", modelId: "claude-fable-5", displayName: "Claude Fable 5" },
  // OpenAI
  { provider: "openai", modelId: "gpt-5.6-sol", displayName: "GPT-5.6 Sol" },
  { provider: "openai", modelId: "gpt-5.6-terra", displayName: "GPT-5.6 Terra" },
  { provider: "openai", modelId: "gpt-5.6-luna", displayName: "GPT-5.6 Luna" },
  { provider: "openai", modelId: "o4-mini", displayName: "o4-mini" },
  // Moonshot / Kimi
  { provider: "moonshot", modelId: "kimi-k2.6", displayName: "Kimi K2.6" },
  { provider: "moonshot", modelId: "kimi-k2.5", displayName: "Kimi K2.5" },
  { provider: "moonshot", modelId: "kimi-k3", displayName: "Kimi K3" },
];

export function modelsForProvider(provider: Provider): ModelOption[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function displayNameFor(provider: string, modelId: string): string {
  const found = MODELS.find(
    (m) => m.provider === provider && m.modelId === modelId,
  );
  return found?.displayName ?? modelId;
}

export function providerLabel(provider: string): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}
