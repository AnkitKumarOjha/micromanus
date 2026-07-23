import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";
import { Coins } from "lucide-react";

// Server component: reads credit balance and renders the top navigation.
export async function TopNav({ active }: { active?: "chat" | "keys" | "stats" }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let credits = 0;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .maybeSingle();
    credits = profile?.credits_balance ?? 0;
  }

  const link = (
    href: string,
    label: string,
    key: "chat" | "keys" | "stats",
  ) => (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-1.5 text-sm transition-colors " +
        (active === key
          ? "bg-secondary font-medium"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-1">
        <Link href="/chat" className="mr-2 font-semibold">
          MicroManus
        </Link>
        {link("/chat", "Chat", "chat")}
        {link("/settings/keys", "API keys", "keys")}
        {link("/stats", "Stats", "stats")}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
          title="Credits remaining. 1 credit = 1 agent run."
        >
          <Coins className="h-4 w-4" />
          {credits} {credits === 1 ? "credit" : "credits"}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
