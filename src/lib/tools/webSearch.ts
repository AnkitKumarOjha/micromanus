import { serverEnv } from "@/lib/env";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Brave Web Search API. Returns the top ~8 results (title, url, snippet).
export async function webSearch(query: string): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": serverEnv.braveApiKey,
    },
    // Never cache; each research query is fresh.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Brave Search failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const results = data.web?.results ?? [];
  return results.slice(0, 8).map((r) => ({
    title: r.title ?? r.url ?? "(untitled)",
    url: r.url ?? "",
    snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
  }));
}
