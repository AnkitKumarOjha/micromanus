import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "standardwebhooks";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { applyCredit } from "@/lib/credits";
import { serverEnv, CREDITS_PER_UNLOCK, CREDIT_PRICE_CENTS } from "@/lib/env";

export const runtime = "nodejs";

// DodoPayments webhook — the source of truth for completed payments. The
// client return URL is only used to redirect the UI, never trusted to grant
// credits. Signatures are verified; crediting is idempotent per payment id.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
  };

  // Verify the signature. On failure, reject.
  try {
    const webhook = new Webhook(serverEnv.dodoWebhookSecret);
    await webhook.verify(rawBody, headers);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    type?: string;
    data?: {
      payment_id?: string;
      metadata?: Record<string, string> | null;
      total_amount?: number;
      currency?: string;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // We only act on successful payments for our product.
  if (payload.type !== "payment.succeeded") {
    return NextResponse.json({ received: true, ignored: payload.type });
  }

  const data = payload.data ?? {};
  const paymentId = data.payment_id;
  const userId = data.metadata?.user_id;

  if (!paymentId || !userId) {
    // Nothing we can safely credit — acknowledge so Dodo stops retrying.
    return NextResponse.json({ received: true, note: "missing ids" });
  }

  const service = createSupabaseServiceClient();

  // Idempotency: the unique index on payments.dodo_payment_id lets exactly one
  // succeeded row exist per payment. If the insert conflicts, we've already
  // processed this payment and must NOT credit again.
  const { error: insertErr } = await service.from("payments").insert({
    user_id: userId,
    dodo_payment_id: paymentId,
    amount_cents: data.total_amount ?? CREDIT_PRICE_CENTS,
    currency: data.currency ?? "USD",
    status: "succeeded",
    raw_payload: payload as unknown as Record<string, unknown>,
  });

  if (insertErr) {
    // 23505 = unique_violation → already processed.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  try {
    await applyCredit(service, {
      userId,
      amount: CREDITS_PER_UNLOCK,
      type: "payment",
      referenceId: paymentId,
      setPaywallUnlocked: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "credit failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true, credited: true });
}
