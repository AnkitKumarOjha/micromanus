import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { TopNav } from "@/components/app/TopNav";
import { displayNameFor, providerLabel } from "@/lib/models";
import { formatTokens, formatUsd } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChatStatsPage({
  params,
}: {
  params: { chatId: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createSupabaseServiceClient();

  const { data: chat } = await service
    .from("chats")
    .select("id, title, provider, model_id, user_id")
    .eq("id", params.chatId)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) notFound();

  const { data: logs } = await service
    .from("usage_logs")
    .select(
      "id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_input_usd, cost_output_usd, cost_cache_usd, cost_total_usd, created_at",
    )
    .eq("chat_id", params.chatId)
    .order("created_at", { ascending: true });

  type Log = {
    id: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_input_usd: number;
    cost_output_usd: number;
    cost_cache_usd: number;
    cost_total_usd: number;
    created_at: string;
  };
  const rows = (logs ?? []) as Log[];
  const total = rows.reduce((s, r) => s + Number(r.cost_total_usd), 0);

  return (
    <div className="min-h-screen">
      <TopNav active="stats" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/stats"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All chats
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{chat.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {providerLabel(chat.provider)} ·{" "}
          {displayNameFor(chat.provider, chat.model_id)} · {rows.length} run
          {rows.length === 1 ? "" : "s"} · total {formatUsd(total)}
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Run</th>
                <th className="px-4 py-3 text-right">Input tok</th>
                <th className="px-4 py-3 text-right">Output tok</th>
                <th className="px-4 py-3 text-right">Cache tok</th>
                <th className="px-4 py-3 text-right">$ input</th>
                <th className="px-4 py-3 text-right">$ output</th>
                <th className="px-4 py-3 text-right">$ cache</th>
                <th className="px-4 py-3 text-right">$ total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No runs recorded for this chat yet.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3 text-muted-foreground">
                      #{i + 1}
                      <span className="ml-2 text-xs">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(r.input_tokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(r.output_tokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(
                        r.cache_read_tokens + r.cache_write_tokens,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatUsd(Number(r.cost_input_usd))}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatUsd(Number(r.cost_output_usd))}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatUsd(Number(r.cost_cache_usd))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatUsd(Number(r.cost_total_usd))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
