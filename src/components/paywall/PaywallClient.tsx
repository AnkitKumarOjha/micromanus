"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Ticket, CreditCard, CheckCircle2 } from "lucide-react";

export function PaywallClient({
  couponRedeemed,
  topUp,
  credits,
}: {
  couponRedeemed: boolean;
  topUp: boolean;
  credits: number;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponOk, setCouponOk] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function redeem() {
    setCouponError(null);
    setCouponLoading(true);
    try {
      const res = await fetch("/api/coupon/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error ?? "Redemption failed");
      } else {
        setCouponOk(true);
        router.replace("/chat");
        router.refresh();
      }
    } catch {
      setCouponError("Network error. Try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  async function pay() {
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.checkout_url) {
        setPayError(data.error ?? "Could not start checkout");
        setPayLoading(false);
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setPayError("Network error. Try again.");
      setPayLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {topUp ? "You're out of credits" : "Unlock MicroManus"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {topUp
            ? `Balance: ${credits} credits. Each agent run costs 1 credit. Top up to keep researching.`
            : "Redeem a coupon or pay $5 to get 5 credits. 1 credit = 1 agent run."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Path A — coupon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5" /> Redeem a coupon
            </CardTitle>
            <CardDescription>
              One-time per account. Grants 5 credits instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {couponRedeemed ? (
              <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" /> You&apos;ve already redeemed
                your coupon. Use the card option to add more credits.
              </div>
            ) : (
              <>
                <Input
                  placeholder="Enter coupon code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") redeem();
                  }}
                  disabled={couponLoading || couponOk}
                />
                <Button
                  className="w-full"
                  onClick={redeem}
                  disabled={couponLoading || couponOk || code.trim() === ""}
                >
                  {couponLoading ? <Spinner /> : null}
                  {couponOk ? "Unlocked!" : "Redeem coupon"}
                </Button>
                {couponError && (
                  <p className="text-sm text-destructive">{couponError}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Path B — card payment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5" /> Pay $5 with a card
            </CardTitle>
            <CardDescription>
              Secure card payment via DodoPayments. Grants 5 credits after
              payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={pay} disabled={payLoading}>
              {payLoading ? <Spinner /> : <CreditCard className="h-4 w-4" />}
              {topUp ? "Buy 5 more credits — $5" : "Pay $5 — get 5 credits"}
            </Button>
            {payError && <p className="text-sm text-destructive">{payError}</p>}
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              You&apos;ll be redirected to DodoPayments&apos; secure checkout to
              complete your $5 payment.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
