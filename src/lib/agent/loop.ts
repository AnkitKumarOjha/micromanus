import { MAX_AGENT_ITERATIONS } from "@/lib/env";
import type {
  ChatMessage,
  ModelUsage,
  ProviderAdapter,
} from "@/lib/providers/types";
import type { AgentStep } from "@/lib/types";
import { TOOL_DEFINITIONS, executeTool, type AgentToolContext } from "./tools";
import { buildSystemPrompt } from "./systemPrompt";

export interface RunAgentInput {
  adapter: ProviderAdapter;
  apiKey: string;
  baseUrl?: string;
  model: string;
  // Full conversation up to and including the new user message.
  messages: ChatMessage[];
  toolContext: AgentToolContext;
  emit: (step: AgentStep) => void;
}

export interface RunAgentResult {
  finalText: string;
  trace: AgentStep[];
  usage: ModelUsage;
  hitStepLimit: boolean;
}

function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

// Runs the real think → act → observe loop. Streams step events via `emit`,
// executes tools server-side, and returns the final answer plus an aggregated
// token-usage figure across every model call made during the run.
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const working: ChatMessage[] = [...input.messages];
  const trace: AgentStep[] = [];
  let usage: ModelUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  // Wrap emit so trace-worthy events are both streamed and recorded for reload.
  const emit = (step: AgentStep) => {
    if (
      step.type === "tool_call" ||
      step.type === "tool_result" ||
      step.type === "artifact" ||
      step.type === "status"
    ) {
      trace.push(step);
    }
    input.emit(step);
  };
  const toolContext: AgentToolContext = { ...input.toolContext, emit };

  let finalText = "";
  let hitStepLimit = true;

  // Some models (notably lighter ones like Gemini Flash-Lite) occasionally
  // return an EMPTY completion after a tool result instead of writing the
  // answer. Rather than surrender with "(no answer produced)", nudge the model
  // to compose the answer, up to a small budget.
  const MAX_EMPTY_RETRIES = 2;
  let emptyRetries = 0;

  // Computed once so it's stable across this run's iterations (keeps the
  // Anthropic system-prompt cache valid within the run).
  const system = buildSystemPrompt();

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const output = await input.adapter.callModel({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      system,
      messages: working,
      tools: TOOL_DEFINITIONS,
      maxTokens: 8000,
    });
    usage = addUsage(usage, output.usage);

    // No tool calls → the model intends to finish this turn.
    if (!output.toolCalls || output.toolCalls.length === 0) {
      const text = (output.text ?? "").trim();
      if (text !== "") {
        finalText = text;
        emit({ type: "assistant_final", text: finalText });
        hitStepLimit = false;
        break;
      }
      // Empty answer. Nudge the model to actually write it, then retry.
      if (emptyRetries < MAX_EMPTY_RETRIES) {
        emptyRetries++;
        working.push({
          role: "user",
          content:
            "Please write your complete final answer now, based on the information gathered above. Respond with the answer text itself (well-structured Markdown, and cite the sources you used). Do not call any more tools unless truly necessary.",
        });
        continue;
      }
      // Still empty after retries — surface a useful message instead of blank.
      finalText =
        "I gathered research but the selected model returned an empty response when composing the final answer. This can happen with lighter models — please try again, ideally with a more capable model (e.g. Gemini 2.5 Flash or Gemini Pro, or a Claude model).";
      emit({ type: "assistant_final", text: finalText });
      hitStepLimit = false;
      break;
    }

    // Interim reasoning text alongside tool calls — surface it as a status.
    if (output.text && output.text.trim() !== "") {
      emit({ type: "status", text: output.text.trim() });
    }

    // Record the assistant turn (text + tool calls) for the model's context.
    working.push({
      role: "assistant",
      content: output.text ?? "",
      toolCalls: output.toolCalls,
    });

    // Execute each requested tool and feed results back.
    for (const call of output.toolCalls) {
      let resultContent: string;
      try {
        const res = await executeTool(call.name, call.arguments, toolContext);
        resultContent = res.content;
      } catch (err) {
        resultContent =
          "Tool error: " + (err instanceof Error ? err.message : String(err));
      }
      working.push({
        role: "tool",
        content: resultContent,
        toolCallId: call.id,
      });
    }
  }

  if (hitStepLimit) {
    finalText =
      "I wasn't able to finish this within the step budget. Here's what I gathered so far — try narrowing the question or asking me to continue.";
    emit({ type: "assistant_final", text: finalText });
  }

  return { finalText, trace, usage, hitStepLimit };
}
