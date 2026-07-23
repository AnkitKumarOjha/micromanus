import Anthropic from "@anthropic-ai/sdk";
import type {
  CallModelInput,
  CallModelOutput,
  ProviderAdapter,
  ToolCall,
} from "./types";
import { ZERO_USAGE } from "./types";

// Build the Anthropic `messages` array from our neutral format. Consecutive
// "tool" messages collapse into a single user message carrying tool_result
// blocks (Anthropic requires tool results in one user turn).
function toAnthropicMessages(
  messages: CallModelInput["messages"],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === "system") continue; // handled via top-level system
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.toolCallId ?? "",
        content: m.content,
      });
      continue;
    }
    flushToolResults();
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content && m.content.trim() !== "") {
        blocks.push({ type: "text", text: m.content });
      }
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      out.push({
        role: "assistant",
        content: blocks.length > 0 ? blocks : m.content || "",
      });
    }
  }
  flushToolResults();
  return out;
}

export const anthropicAdapter: ProviderAdapter = {
  async callModel(input: CallModelInput): Promise<CallModelOutput> {
    const client = new Anthropic({
      apiKey: input.apiKey,
      ...(input.baseUrl ? { baseURL: input.baseUrl } : {}),
    });

    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    const response = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens ?? 4096,
      // Cache the (stable, repeated-every-iteration) system prompt.
      system: [
        {
          type: "text",
          text: input.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: toAnthropicMessages(input.messages),
      ...(tools.length > 0 ? { tools } : {}),
    });

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    const u = response.usage;
    return {
      text,
      toolCalls,
      stopReason: response.stop_reason ?? undefined,
      usage: {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  },

  async testConnection(apiKey: string, baseUrl?: string): Promise<void> {
    const client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    // Lightweight, key-validating call that doesn't depend on a specific model.
    await client.models.list();
  },
};

export { ZERO_USAGE };
