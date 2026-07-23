import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Lightweight polling endpoint for the /paywall/success page: returns whether
// the account is unlocked yet and the current credit balance.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("paywall_unlocked, credits_balance")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    paywall_unlocked: !!profile?.paywall_unlocked,
    credits_balance: profile?.credits_balance ?? 0,
  });
}
