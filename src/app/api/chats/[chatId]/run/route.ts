import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { applyCredit } from "@/lib/credits";
import { ensureProfile } from "@/lib/profile";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter, humanizeProviderError } from "@/lib/providers";
import type { ChatMessage } from "@/lib/providers/types";
import { runAgent } from "@/lib/agent/loop";
import { computeCost, round6 } from "@/lib/pricing";
import { serverEnv } from "@/lib/env";
import type { AgentStep, DbMessage, ModelPricing, Provider } from "@/lib/types";

export const runtime = "nodejs";
// 60s is the Vercel Hobby (free) ceiling. On Pro you can raise this to 300 for
// longer deep-research runs.
export const maxDuration = 60;

function sse(step: AgentStep): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(step)}\n\n`);
}

export async function POST(
  request: Request,
  { params }: { params: { chatId: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let userText = "";
  try {
    const body = (await request.json()) as { message?: string };
    userText = (body.message ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!userText) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  await ensureProfile(service, user);

  // Verify chat ownership.
  const { data: chat } = await service
    .from("chats")
    .select("id, title, provider, model_id, user_id")
    .eq("id", params.chatId)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }
  const provider = chat.provider as Provider;
  const modelId = chat.model_id as string;

  // Credit check — block the run if the balance is empty (paywall re-entry).
  const { data: profile } = await service
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();
  const balance = profile?.credits_balance ?? 0;
  if (balance < 1) {
    return Response.json(
      { error: "out_of_credits", credits_balance: balance },
      { status: 402 },
    );
  }

  // A key for this provider must exist (no debit if missing).
  const { data: cred } = await service
    .from("llm_credentials")
    .select("api_key_encrypted, base_url")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cred) {
    return Response.json(
      { error: `No ${provider} API key saved. Add one in Settings → API keys.` },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(cred.api_key_encrypted);
  } catch {
    return Response.json(
      { error: "Stored key could not be decrypted. Re-add the key." },
      { status: 500 },
    );
  }
  const baseUrl = cred.base_url || undefined;

  // Debit 1 credit for this agent run.
  let balanceAfter: number;
  try {
    const res = await applyCredit(service, {
      userId: user.id,
      amount: -1,
      type: "agent_run_debit",
      referenceId: chat.id,
    });
    balanceAfter = res.balanceAfter;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Debit failed" },
      { status: 500 },
    );
  }

  // Build model conversation from prior turns, then the new user message.
  const { data: prior } = await service
    .from("messages")
    .select("role, content, sequence_number")
    .eq("chat_id", chat.id)
    .order("sequence_number", { ascending: true });
  const priorRows = (prior ?? []) as Pick<
    DbMessage,
    "role" | "content" | "sequence_number"
  >[];
  const nextSeq =
    (priorRows.length > 0
      ? priorRows[priorRows.length - 1].sequence_number
      : 0) + 1;

  const history: ChatMessage[] = [];
  for (const m of priorRows) {
    if (m.role === "user" && m.content) {
      history.push({ role: "user", content: m.content });
    } else if (m.role === "assistant" && m.content && m.content.trim() !== "") {
      history.push({ role: "assistant", content: m.content });
    }
  }
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userText },
  ];

  // Persist the user message and an assistant placeholder (so artifacts and the
  // usage log can reference the assistant message id).
  await service.from("messages").insert({
    chat_id: chat.id,
    role: "user",
    content: userText,
    sequence_number: nextSeq,
  });
  const { data: placeholder, error: phErr } = await service
    .from("messages")
    .insert({
      chat_id: chat.id,
      role: "assistant",
      content: "",
      sequence_number: nextSeq + 1,
    })
    .select("id")
    .single();
  if (phErr || !placeholder) {
    return Response.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
  const assistantMessageId = placeholder.id as string;

  // Pricing row for cost math.
  const { data: pricing } = await service
    .from("model_pricing")
    .select("*")
    .eq("provider", provider)
    .eq("model_id", modelId)
    .maybeSingle();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (step: AgentStep) => {
        try {
          controller.enqueue(sse(step));
        } catch {
          // stream already closed
        }
      };

      emit({ type: "credits", balance: balanceAfter });

      try {
        const result = await runAgent({
          adapter: getAdapter(provider),
          apiKey,
          baseUrl,
          model: modelId,
          messages,
          toolContext: {
            service,
            chatId: chat.id,
            userId: user.id,
            assistantMessageId,
            siteUrl: serverEnv.siteUrl,
            emit: () => {}, // replaced inside runAgent
          },
          emit,
        });

        // Persist the final assistant message + its step trace.
        await service
          .from("messages")
          .update({
            content: result.finalText,
            tool_calls: result.trace as unknown as Record<string, unknown>,
          })
          .eq("id", assistantMessageId);

        // Aggregate cost for the whole run and write one usage log row.
        const cost = computeCost(
          {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheWriteTokens: result.usage.cacheWriteTokens,
          },
          (pricing as ModelPricing | null) ?? null,
        );
        await service.from("usage_logs").insert({
          chat_id: chat.id,
          message_id: assistantMessageId,
          user_id: user.id,
          provider,
          model_id: modelId,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_tokens: result.usage.cacheReadTokens,
          cache_write_tokens: result.usage.cacheWriteTokens,
          cost_input_usd: round6(cost.costInputUsd),
          cost_output_usd: round6(cost.costOutputUsd),
          cost_cache_usd: round6(cost.costCacheUsd),
          cost_total_usd: round6(cost.costTotalUsd),
        });

        // Title the thread from the first user message, and bump activity time.
        const chatUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (chat.title === "New chat") {
          chatUpdate.title =
            userText.length > 60 ? userText.slice(0, 57) + "…" : userText;
        }
        await service.from("chats").update(chatUpdate).eq("id", chat.id);

        emit({
          type: "usage",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costTotalUsd: round6(cost.costTotalUsd),
        });
      } catch (err) {
        // The model call failed before producing an answer — refund the credit.
        let refundBalance = balanceAfter;
        try {
          const r = await applyCredit(service, {
            userId: user.id,
            amount: 1,
            type: "manual_adjustment",
            referenceId: "refund:" + chat.id,
          });
          refundBalance = r.balanceAfter;
        } catch {
          // if refund fails, keep the debited balance
        }
        const message = humanizeProviderError(err);
        await service
          .from("messages")
          .update({ content: `⚠️ Run failed: ${message}` })
          .eq("id", assistantMessageId);
        emit({ type: "error", message });
        emit({ type: "credits", balance: refundBalance });
      } finally {
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
