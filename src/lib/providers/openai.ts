import OpenAI from "openai";
import type {
  CallModelInput,
  CallModelOutput,
  ProviderAdapter,
  ToolCall,
} from "./types";

// One adapter for every OpenAI-compatible endpoint: native OpenAI, Kimi /
// Moonshot (base URL https://api.moonshot.ai/v1), and any custom endpoint.
// Only the base URL differs. Context caching is automatic server-side; we read
// prompt_tokens_details.cached_tokens for the cost breakdown.

function toOpenAIMessages(
  system: string,
  messages: CallModelInput["messages"],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system && system.trim() !== "") {
    out.push({ role: "system", content: system });
  }
  for (const m of messages) {
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
    } else if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: m.content || "",
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
        if (!m.content) msg.content = null;
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: m.content,
      });
    }
  }
  return out;
}

function makeAdapter(defaultBaseUrl?: string): ProviderAdapter {
  return {
    async callModel(input: CallModelInput): Promise<CallModelOutput> {
      const client = new OpenAI({
        apiKey: input.apiKey,
        baseURL: input.baseUrl || defaultBaseUrl,
      });

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
        input.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));

      const response = await client.chat.completions.create({
        model: input.model,
        max_tokens: input.maxTokens ?? 4096,
        messages: toOpenAIMessages(input.system, input.messages),
        ...(tools.length > 0 ? { tools } : {}),
      });

      const choice = response.choices[0];
      const text = choice?.message?.content ?? "";
      const toolCalls: ToolCall[] = [];
      for (const tc of choice?.message?.tool_calls ?? []) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          args = { _raw: tc.function.arguments };
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
      }

      const u = response.usage;
      const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
      const promptTokens = u?.prompt_tokens ?? 0;
      return {
        text: text ?? "",
        toolCalls,
        stopReason: choice?.finish_reason ?? undefined,
        usage: {
          // Uncached input = prompt tokens minus the portion served from cache.
          inputTokens: Math.max(0, promptTokens - cached),
          outputTokens: u?.completion_tokens ?? 0,
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
        },
      };
    },

    async testConnection(apiKey: string, baseUrl?: string): Promise<void> {
      const client = new OpenAI({
        apiKey,
        baseURL: baseUrl || defaultBaseUrl,
      });
      await client.models.list();
    },
  };
}

export const openaiAdapter = makeAdapter("https://api.openai.com/v1");
export const moonshotAdapter = makeAdapter("https://api.moonshot.ai/v1");
// Google Gemini's OpenAI-compatible endpoint (function calling + usage supported).
export const geminiAdapter = makeAdapter(
  "https://generativelanguage.googleapis.com/v1beta/openai",
);
// Custom has no default base URL — it must always be supplied by the caller.
export const customAdapter = makeAdapter(undefined);
