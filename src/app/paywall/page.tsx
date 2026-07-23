import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PaywallClient } from "@/components/paywall/PaywallClient";

export const dynamic = "force-dynamic";

export default async function PaywallPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("paywall_unlocked, coupon_redeemed, credits_balance")
    .eq("id", user.id)
    .maybeSingle();

  const unlocked = !!profile?.paywall_unlocked;
  const couponRedeemed = !!profile?.coupon_redeemed;
  const credits = profile?.credits_balance ?? 0;

  // Top-up mode: already unlocked but out of credits.
  const topUp = unlocked && credits <= 0;

  return (
    <PaywallClient
      couponRedeemed={couponRedeemed}
      topUp={topUp}
      credits={credits}
    />
  );
}
