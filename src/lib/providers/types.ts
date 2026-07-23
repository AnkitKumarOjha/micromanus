// Uniform, provider-agnostic contract the agent loop talks to. Each provider
// adapter converts to/from its own SDK shape behind this interface so the loop
// never branches on provider.

import type { Provider } from "@/lib/types";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string; // text content ("" when the turn is purely tool calls)
  toolCalls?: ToolCall[]; // assistant-issued tool calls
  toolCallId?: string; // for role "tool": the call id this result answers
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (object)
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CallModelInput {
  apiKey: string;
  baseUrl?: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

export interface CallModelOutput {
  text: string;
  toolCalls: ToolCall[];
  usage: ModelUsage;
  stopReason?: string;
}

export interface ProviderAdapter {
  callModel(input: CallModelInput): Promise<CallModelOutput>;
  // Minimal real request used to validate a key before saving.
  testConnection(apiKey: string, baseUrl?: string): Promise<void>;
}

export const ZERO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export type ProviderName = Provider;
