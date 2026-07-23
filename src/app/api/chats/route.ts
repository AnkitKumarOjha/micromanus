import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Provider } from "@/lib/types";

export const runtime = "nodejs";

const VALID_PROVIDERS: Provider[] = ["anthropic", "openai", "moonshot", "custom"];

// GET — list the user's non-archived chats, newest activity first.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("chats")
    .select("id, title, provider, model_id, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ chats: data ?? [] });
}

// POST — create a new chat thread. Provider + model are fixed for the thread.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { provider?: string; modelId?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const provider = body.provider as Provider;
  const modelId = (body.modelId ?? "").trim();
  const title = (body.title ?? "New chat").trim() || "New chat";

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!modelId) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  // Ensure the user actually has a key for this provider before creating.
  const { count } = await service
    .from("llm_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("provider", provider);
  if (!count || count === 0) {
    return NextResponse.json(
      { error: `Add a ${provider} API key first (Settings → API keys).` },
      { status: 400 },
    );
  }

  const { data, error } = await service
    .from("chats")
    .insert({ user_id: user.id, provider, model_id: modelId, title })
    .select("id, title, provider, model_id, created_at, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create chat" },
      { status: 500 },
    );
  }
  return NextResponse.json({ chat: data });
}
