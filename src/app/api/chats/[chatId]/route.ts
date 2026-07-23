import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { DbMessage } from "@/lib/types";

export const runtime = "nodejs";

// GET — full thread for reload: chat meta + ordered messages (with their step
// trace) + artifacts, so the UI reconstructs the conversation exactly.
export async function GET(
  _request: Request,
  { params }: { params: { chatId: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const service = createSupabaseServiceClient();

  const { data: chat } = await service
    .from("chats")
    .select("id, title, provider, model_id, created_at, updated_at, user_id")
    .eq("id", params.chatId)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: messages } = await service
    .from("messages")
    .select(
      "id, role, content, tool_calls, tool_results, sequence_number, created_at",
    )
    .eq("chat_id", params.chatId)
    .order("sequence_number", { ascending: true });

  const { data: artifacts } = await service
    .from("artifacts")
    .select("id, message_id, type, title, created_at")
    .eq("chat_id", params.chatId)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    chat: {
      id: chat.id,
      title: chat.title,
      provider: chat.provider,
      model_id: chat.model_id,
    },
    messages: (messages ?? []) as DbMessage[],
    artifacts: artifacts ?? [],
  });
}

// DELETE — remove a chat (and its messages/usage/artifacts via cascade).
export async function DELETE(
  _request: Request,
  { params }: { params: { chatId: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("chats")
    .delete()
    .eq("id", params.chatId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
