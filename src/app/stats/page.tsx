import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { TopNav } from "@/components/app/TopNav";
import { StatsTable, type ChatStatRow } from "@/components/stats/StatsTable";
import { displayNameFor } from "@/lib/models";
import { formatTokens, formatUsd } from "@/lib/utils";
import { Coins, DollarSign, Hash } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createSupabaseServiceClient();

  const [{ data: chats }, { data: logs }, { data: profile }] =
    await Promise.all([
      service
        .from("chats")
        .select("id, title, provider, model_id, updated_at")
        .eq("user_id", user.id)
        .eq("archived", false),
      service
        .from("usage_logs")
        .select(
          "chat_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_total_usd",
        )
        .eq("user_id", user.id),
      service
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  type Log = {
    chat_id: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_total_usd: number;
  };
  const logRows = (logs ?? []) as Log[];

  const byChat = new Map<
    string,
    {
      runs: number;
      input: number;
      output: number;
      cache: number;
      cost: number;
    }
  >();
  let totalCost = 0;
  let totalTokens = 0;
  for (const l of logRows) {
    const agg =
      byChat.get(l.chat_id) ??
      { runs: 0, input: 0, output: 0, cache: 0, cost: 0 };
    agg.runs += 1;
    agg.input += l.input_tokens;
    agg.output += l.output_tokens;
    agg.cache += l.cache_read_tokens + l.cache_write_tokens;
    agg.cost += Number(l.cost_total_usd);
    byChat.set(l.chat_id, agg);
    totalCost += Number(l.cost_total_usd);
    totalTokens +=
      l.input_tokens +
      l.output_tokens +
      l.cache_read_tokens +
      l.cache_write_tokens;
  }

  const rows: ChatStatRow[] = (chats ?? []).map(
    (c: {
      id: string;
      title: string;
      provider: string;
      model_id: string;
      updated_at: string;
    }) => {
      const agg = byChat.get(c.id) ?? {
        runs: 0,
        input: 0,
        output: 0,
        cache: 0,
        cost: 0,
      };
      return {
        chatId: c.id,
        title: c.title,
        model: displayNameFor(c.provider, c.model_id),
        runs: agg.runs,
        inputTokens: agg.input,
        outputTokens: agg.output,
        cacheTokens: agg.cache,
        totalCost: agg.cost,
        updatedAt: c.updated_at,
      };
    },
  );

  const credits = profile?.credits_balance ?? 0;

  return (
    <div className="min-h-screen">
      <TopNav active="stats" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Cost &amp; usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Token usage and USD cost on <span className="font-medium">your</span>{" "}
          LLM API key, computed from each chat&apos;s model pricing. Separate
          from your MicroManus credit balance.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Total spend (your key)"
            value={formatUsd(totalCost)}
          />
          <SummaryCard
            icon={<Hash className="h-5 w-5" />}
            label="Total tokens"
            value={formatTokens(totalTokens)}
          />
          <SummaryCard
            icon={<Coins className="h-5 w-5" />}
            label="Credits remaining"
            value={`${credits}`}
          />
        </div>

        <div className="mt-8">
          <StatsTable rows={rows} />
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
