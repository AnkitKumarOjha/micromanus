import * as cheerio from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Pluggable web search. Picks a provider based on which key is present so the
// app works free out of the box:
//   1. Tavily        — TAVILY_API_KEY        (recommended free tier, no card)
//   2. Brave         — BRAVE_SEARCH_API_KEY  (optional)
//   3. DuckDuckGo    — no key                (zero-config best-effort fallback)
type SearchProvider = "tavily" | "brave" | "duckduckgo";

function pickProvider(): SearchProvider {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  return "duckduckgo";
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  const provider = pickProvider();
  if (provider === "tavily") return tavilySearch(query);
  if (provider === "brave") return braveSearch(query);
  return duckDuckGoSearch(query);
}

// ---- Tavily (https://tavily.com) — free 1,000 searches/mo, no credit card ----
async function tavilySearch(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: 8,
      search_depth: "basic",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).slice(0, 8).map((r) => ({
    title: r.title ?? r.url ?? "(untitled)",
    url: r.url ?? "",
    snippet: (r.content ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
  }));
}

// ---- Brave (https://api.search.brave.com) ----
async function braveSearch(query: string): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brave search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
  };
  return (data.web?.results ?? []).slice(0, 8).map((r) => ({
    title: r.title ?? r.url ?? "(untitled)",
    url: r.url ?? "",
    snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
  }));
}

// ---- DuckDuckGo HTML endpoint — no key, best-effort (may rate-limit) ----
function decodeDdgHref(href: string): string {
  let normalized = href;
  if (normalized.startsWith("//")) normalized = "https:" + normalized;
  else if (normalized.startsWith("/"))
    normalized = "https://duckduckgo.com" + normalized;
  try {
    const u = new URL(normalized);
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : normalized;
  } catch {
    return normalized;
  }
}

async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch(
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed (${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $(".result, .web-result").each((_, el) => {
    if (results.length >= 8) return;
    const a = $(el).find("a.result__a").first();
    const title = a.text().trim();
    const href = a.attr("href") ?? "";
    const snippet = $(el).find(".result__snippet").first().text().trim();
    if (title && href) {
      results.push({ title, url: decodeDdgHref(href), snippet });
    }
  });
  return results;
}
