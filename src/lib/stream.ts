import type { AgentStep } from "@/lib/types";

// Client-side SSE reader for the agent run endpoint. Calls onStep for each
// event. Returns { outOfCredits } when the server refuses due to 0 balance.
export async function streamAgentRun(
  chatId: string,
  message: string,
  onStep: (step: AgentStep) => void,
): Promise<{ outOfCredits?: boolean }> {
  const res = await fetch(`/api/chats/${chatId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (res.status === 402) {
    return { outOfCredits: true };
  }

  if (!res.ok || !res.body) {
    let msg = "Run failed";
    try {
      const d = await res.json();
      msg = d.error ?? msg;
    } catch {
      // ignore
    }
    onStep({ type: "error", message: msg });
    onStep({ type: "done" });
    return {};
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        onStep(JSON.parse(json) as AgentStep);
      } catch {
        // ignore malformed chunk
      }
    }
  }
  return {};
}
