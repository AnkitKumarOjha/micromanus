import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createDodoClient } from "@/lib/dodo";
import { serverEnv, CREDIT_PRICE_CENTS } from "@/lib/env";

export const runtime = "nodejs";

// Create a DodoPayments hosted checkout session for the $5 / 5-credit product
// and return the checkout URL for the browser to redirect to. The webhook is
// the source of truth for granting credits — this route never credits.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const dodo = createDodoClient();
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        { product_id: serverEnv.dodoProductId, quantity: 1 },
      ],
      customer: {
        email: user.email ?? "customer@example.com",
        name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          user.email ??
          "MicroManus user",
      },
      return_url: `${serverEnv.siteUrl}/paywall/success`,
      // The webhook reads this to know which account to credit.
      metadata: { user_id: user.id },
    });

    // Record a pending payment so the webhook can be reconciled/deduped.
    const service = createSupabaseServiceClient();
    await service.from("payments").insert({
      user_id: user.id,
      dodo_checkout_session_id: session.session_id,
      amount_cents: CREDIT_PRICE_CENTS,
      currency: "USD",
      status: "pending",
    });

    return NextResponse.json({ checkout_url: session.checkout_url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
