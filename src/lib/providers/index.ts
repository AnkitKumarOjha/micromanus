import type { Provider } from "@/lib/types";
import type { ProviderAdapter } from "./types";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter, moonshotAdapter, customAdapter } from "./openai";

export * from "./types";

export function getAdapter(provider: Provider): ProviderAdapter {
  switch (provider) {
    case "anthropic":
      return anthropicAdapter;
    case "openai":
      return openaiAdapter;
    case "moonshot":
      return moonshotAdapter;
    case "custom":
      return customAdapter;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Turn a raw provider SDK error into a readable, non-leaky message for the UI.
export function humanizeProviderError(err: unknown): string {
  const anyErr = err as {
    status?: number;
    message?: string;
    error?: { message?: string };
  };
  const status = anyErr?.status;
  const msg = anyErr?.error?.message || anyErr?.message || "Unknown error";
  if (status === 401 || status === 403) {
    return "Authentication failed — the API key was rejected. Check the key and provider.";
  }
  if (status === 404) {
    return "Model or endpoint not found — check the model id and base URL.";
  }
  if (status === 429) {
    return "Rate limited by the provider. Wait a moment and try again.";
  }
  if (status && status >= 500) {
    return "The provider had a server error. Try again shortly.";
  }
  // Never echo secrets; keep it short.
  return msg.slice(0, 300);
}
