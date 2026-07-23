import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Search, FileText, KeyRound, Gauge } from "lucide-react";

export default async function LandingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("paywall_unlocked")
      .eq("id", user.id)
      .maybeSingle();
    redirect(profile?.paywall_unlocked ? "/chat" : "/paywall");
  }

  const features = [
    {
      icon: Search,
      title: "Live deep research",
      body: "A real think → search → read → conclude loop over the live web, not a single completion.",
    },
    {
      icon: FileText,
      title: "PDF reports",
      body: "Ask for a report and download a properly rendered PDF artifact, with sources.",
    },
    {
      icon: KeyRound,
      title: "Bring your own key",
      body: "Use your own Claude, OpenAI, or Kimi key. Nothing is preloaded; keys are encrypted at rest.",
    },
    {
      icon: Gauge,
      title: "Cost & usage stats",
      body: "See input/output/cache tokens and USD cost per chat and per run on your own key.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        deep-research agent · bring your own key
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        MicroManus
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Chat with a deep-research AI agent that browses the live web, reasons in
        a visible tool loop, keeps per-thread context, and hands you a
        downloadable PDF report when you need one.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login">
          <Button size="lg">Get started</Button>
        </Link>
      </div>

      <div className="mt-16 grid w-full gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border bg-card p-5 text-left"
          >
            <f.icon className="mb-3 h-5 w-5" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
