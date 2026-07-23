import { MAX_AGENT_ITERATIONS } from "@/lib/env";
import type {
  ChatMessage,
  ModelUsage,
  ProviderAdapter,
} from "@/lib/providers/types";
import type { AgentStep } from "@/lib/types";
import { TOOL_DEFINITIONS, executeTool, type AgentToolContext } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";

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

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const output = await input.adapter.callModel({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      system: SYSTEM_PROMPT,
      messages: working,
      tools: TOOL_DEFINITIONS,
      maxTokens: 4096,
    });
    usage = addUsage(usage, output.usage);

    // No tool calls → this is the final answer.
    if (!output.toolCalls || output.toolCalls.length === 0) {
      finalText = output.text?.trim() || "(no answer produced)";
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
