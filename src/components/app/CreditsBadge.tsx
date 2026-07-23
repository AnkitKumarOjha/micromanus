"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";

// Client-side credit badge. Seeded from the server-rendered value, then updated
// live from the agent-run "credits" event via a window CustomEvent — so the
// count stays fresh without a router.refresh() (which would remount the chat
// shell and reload the thread).
export const CREDITS_EVENT = "micromanus:credits";

export function CreditsBadge({ initial }: { initial: number }) {
  const [credits, setCredits] = useState(initial);

  // Keep in sync if the server value changes (e.g. real navigation).
  useEffect(() => {
    setCredits(initial);
  }, [initial]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number") setCredits(detail);
    };
    window.addEventListener(CREDITS_EVENT, handler);
    return () => window.removeEventListener(CREDITS_EVENT, handler);
  }, []);

  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
      title="Credits remaining. 1 credit = 1 agent run."
    >
      <Coins className="h-4 w-4" />
      {credits} {credits === 1 ? "credit" : "credits"}
    </span>
  );
}
