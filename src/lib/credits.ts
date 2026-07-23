import type { SupabaseClient } from "@supabase/supabase-js";

type CreditType =
  | "coupon_redemption"
  | "payment"
  | "agent_run_debit"
  | "manual_adjustment";

// Apply a signed credit delta to a profile and record the transaction.
// `amount` is positive for a grant, negative for a debit. Optionally flips
// paywall/coupon flags for the unlock paths. Uses the service client (RLS
// bypass) — call only from trusted server code.
export async function applyCredit(
  service: SupabaseClient,
  opts: {
    userId: string;
    amount: number;
    type: CreditType;
    referenceId?: string | null;
    setPaywallUnlocked?: boolean;
    setCouponRedeemed?: boolean;
  },
): Promise<{ balanceAfter: number }> {
  const { data: profile, error: readErr } = await service
    .from("profiles")
    .select("credits_balance")
    .eq("id", opts.userId)
    .single();
  if (readErr || !profile) {
    throw new Error(readErr?.message ?? "profile not found");
  }

  const current = profile.credits_balance as number;
  const balanceAfter = current + opts.amount;

  const profileUpdate: Record<string, unknown> = {
    credits_balance: balanceAfter,
  };
  if (opts.setPaywallUnlocked) profileUpdate.paywall_unlocked = true;
  if (opts.setCouponRedeemed) profileUpdate.coupon_redeemed = true;

  const { error: updErr } = await service
    .from("profiles")
    .update(profileUpdate)
    .eq("id", opts.userId);
  if (updErr) throw new Error(updErr.message);

  const { error: txErr } = await service.from("credit_transactions").insert({
    user_id: opts.userId,
    amount: opts.amount,
    type: opts.type,
    reference_id: opts.referenceId ?? null,
    balance_after: balanceAfter,
  });
  if (txErr) throw new Error(txErr.message);

  return { balanceAfter };
}
