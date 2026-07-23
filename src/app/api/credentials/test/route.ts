import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdapter, humanizeProviderError } from "@/lib/providers";
import type { Provider } from "@/lib/types";

export const runtime = "nodejs";

const VALID_PROVIDERS: Provider[] = ["anthropic", "openai", "moonshot", "custom"];

// Fire a minimal real request to verify a key without saving it.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { provider?: string; apiKey?: string; baseUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const provider = body.provider as Provider;
  const apiKey = (body.apiKey ?? "").trim();
  const baseUrl = (body.baseUrl ?? "").trim() || undefined;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }
  if (provider === "custom" && !baseUrl) {
    return NextResponse.json(
      { error: "A base URL is required for a custom provider" },
      { status: 400 },
    );
  }

  try {
    await getAdapter(provider).testConnection(apiKey, baseUrl);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: humanizeProviderError(err) },
      { status: 400 },
    );
  }
}
