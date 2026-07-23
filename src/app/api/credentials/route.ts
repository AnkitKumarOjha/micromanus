import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getAdapter, humanizeProviderError } from "@/lib/providers";
import { maskKey } from "@/lib/utils";
import type { LlmCredential, Provider } from "@/lib/types";

export const runtime = "nodejs";

const VALID_PROVIDERS: Provider[] = [
  "anthropic",
  "openai",
  "moonshot",
  "gemini",
  "custom",
];

// GET — list the user's saved keys, masked. Full keys are never returned.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("llm_credentials")
    .select("id, provider, label, api_key_encrypted, base_url, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const credentials = (data as LlmCredential[]).map((c) => {
    let masked = "••••";
    try {
      masked = maskKey(decryptSecret(c.api_key_encrypted));
    } catch {
      // ignore — never surface decrypted content or raw errors
    }
    return {
      id: c.id,
      provider: c.provider,
      label: c.label,
      masked,
      base_url: c.base_url,
      created_at: c.created_at,
    };
  });

  return NextResponse.json({ credentials });
}

// POST — validate the key against the provider (a real minimal request), then
// encrypt and store it. Only saves if the test succeeds.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    provider?: string;
    label?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const provider = body.provider as Provider;
  const apiKey = (body.apiKey ?? "").trim();
  const baseUrl = (body.baseUrl ?? "").trim() || undefined;
  const label = (body.label ?? "").trim() || null;

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

  // Validate with a real request before saving.
  try {
    await getAdapter(provider).testConnection(apiKey, baseUrl);
  } catch (err) {
    return NextResponse.json(
      { error: `Test failed: ${humanizeProviderError(err)}` },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("llm_credentials")
    .insert({
      user_id: user.id,
      provider,
      label,
      api_key_encrypted: encryptSecret(apiKey),
      base_url: baseUrl ?? null,
    })
    .select("id, provider, label, base_url, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save key" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    credential: {
      id: data.id,
      provider: data.provider,
      label: data.label,
      masked: maskKey(apiKey),
      base_url: data.base_url,
      created_at: data.created_at,
    },
  });
}
