"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTokens, formatUsd } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

export interface ChatStatRow {
  chatId: string;
  title: string;
  model: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalCost: number;
  updatedAt: string;
}

type SortKey = "cost" | "date";

export function StatsTable({ rows }: { rows: ChatStatRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "cost") return b.totalCost - a.totalCost;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No usage yet. Start a chat and run the agent to see per-chat costs here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Chat</th>
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3 text-right">Runs</th>
            <th className="px-4 py-3 text-right">Input</th>
            <th className="px-4 py-3 text-right">Output</th>
            <th className="px-4 py-3 text-right">Cache</th>
            <th className="px-4 py-3 text-right">
              <button
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setSortKey("cost")}
              >
                Cost <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.chatId} className="border-t hover:bg-muted/30">
              <td className="max-w-[240px] px-4 py-3">
                <Link
                  href={`/stats/${r.chatId}`}
                  className="block truncate font-medium hover:underline"
                >
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.model}</td>
              <td className="px-4 py-3 text-right">{r.runs}</td>
              <td className="px-4 py-3 text-right">
                {formatTokens(r.inputTokens)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatTokens(r.outputTokens)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatTokens(r.cacheTokens)}
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {formatUsd(r.totalCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
        <span>Sorted by {sortKey === "cost" ? "cost" : "most recent"}.</span>
        <button
          className="hover:text-foreground"
          onClick={() => setSortKey(sortKey === "cost" ? "date" : "cost")}
        >
          Sort by {sortKey === "cost" ? "date" : "cost"}
        </button>
      </div>
    </div>
  );
}
