import * as cheerio from "cheerio";

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

const MAX_CHARS = 8000;

// Fetch a URL server-side and extract readable text: strip scripts, styles,
// nav/header/footer/aside, then collapse whitespace. This is what makes the
// agent a *deep* researcher — it can read a source, not just skim a snippet.
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MicroManusBot/1.0; +https://micromanus.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    return {
      url,
      title: url,
      text: `(Unsupported content type: ${contentType || "unknown"})`,
      truncated: false,
    };
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $(
    "script, style, noscript, svg, nav, header, footer, aside, form, iframe, [aria-hidden='true']",
  ).remove();

  const title = ($("title").first().text() || url).trim();

  // Prefer <article> / <main> if present, else body.
  const scope =
    $("article").first().text().trim().length > 200
      ? $("article").first()
      : $("main").first().text().trim().length > 200
        ? $("main").first()
        : $("body");

  let text = scope.text().replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ");
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");

  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS) + "\n…(truncated)";

  return { url, title, text, truncated };
}
