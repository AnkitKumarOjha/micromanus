"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

// Poll the webhook-backed status for a few seconds while the payment settles,
// then move the user into the app. Never a dead end.
export default function PaymentSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "done" | "timeout">(
    "waiting",
  );

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/payments/status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.paywall_unlocked && data.credits_balance > 0) {
          setStatus("done");
          setTimeout(() => {
            router.replace("/chat");
            router.refresh();
          }, 900);
          return;
        }
      } catch {
        // ignore and keep polling
      }
      if (attempts >= 15) {
        if (!cancelled) setStatus("timeout");
        return;
      }
      setTimeout(poll, 1500);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      {status === "waiting" && (
        <>
          <Spinner className="h-8 w-8" />
          <h1 className="text-xl font-semibold">Confirming your payment…</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            We&apos;re waiting for DodoPayments to confirm the payment. This
            usually takes just a few seconds.
          </p>
        </>
      )}
      {status === "done" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <h1 className="text-xl font-semibold">Payment confirmed!</h1>
          <p className="text-sm text-muted-foreground">
            5 credits added. Taking you to your chats…
          </p>
        </>
      )}
      {status === "timeout" && (
        <>
          <h1 className="text-xl font-semibold">Still confirming…</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your payment may still be settling. You can head to the app — your
            credits will appear once the webhook lands.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => router.replace("/chat")}>Go to chats</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Check again
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
