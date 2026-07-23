import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { applyCredit } from "@/lib/credits";
import { ensureProfile } from "@/lib/profile";
import { serverEnv, CREDITS_PER_UNLOCK } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: string };
    code = (body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Enter a coupon code" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  await ensureProfile(service, user);

  // Verify the coupon hasn't already been redeemed on this account.
  const { data: profile, error: profErr } = await service
    .from("profiles")
    .select("coupon_redeemed")
    .eq("id", user.id)
    .single();
  if (profErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 500 });
  }
  if (profile.coupon_redeemed) {
    return NextResponse.json(
      { error: "You've already redeemed a coupon on this account." },
      { status: 400 },
    );
  }

  // Case-insensitive comparison against the configured code.
  if (code.toLowerCase() !== serverEnv.couponCode.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "That coupon code isn't valid." },
      { status: 400 },
    );
  }

  try {
    const { balanceAfter } = await applyCredit(service, {
      userId: user.id,
      amount: CREDITS_PER_UNLOCK,
      type: "coupon_redemption",
      referenceId: "coupon:" + serverEnv.couponCode,
      setPaywallUnlocked: true,
      setCouponRedeemed: true,
    });
    return NextResponse.json({ ok: true, credits_balance: balanceAfter });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Redemption failed" },
      { status: 500 },
    );
  }
}
