import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDefinition } from "@/lib/providers/types";
import type { AgentStep } from "@/lib/types";
import { webSearch } from "@/lib/tools/webSearch";
import { fetchPage } from "@/lib/tools/fetchPage";
import { generateReportPdf } from "@/lib/tools/pdf";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "web_search",
    description:
      "Search the live web via Brave. Returns the top results with title, url, and snippet. Use focused queries to discover relevant sources.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_page",
    description:
      "Fetch a specific URL and return its readable text content (nav/ads/scripts stripped) so you can read a source in depth.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The absolute URL of the page to read.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_pdf_report",
    description:
      "Render a downloadable PDF report from Markdown. Use for report-like deliverables. Include headings and a Sources section in markdown_content.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The report title." },
        markdown_content: {
          type: "string",
          description:
            "The full report body in Markdown, including a Sources/citations section.",
        },
      },
      required: ["title", "markdown_content"],
      additionalProperties: false,
    },
  },
];

export interface AgentToolContext {
  service: SupabaseClient;
  chatId: string;
  userId: string;
  assistantMessageId: string;
  siteUrl: string;
  emit: (step: AgentStep) => void;
}

export interface ToolExecutionResult {
  // The string content fed back to the model as the tool result.
  content: string;
}

const REPORTS_BUCKET = "reports";

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolExecutionResult> {
  if (name === "web_search") {
    const query = String(args.query ?? "").trim();
    ctx.emit({
      type: "tool_call",
      tool: "web_search",
      label: `Searching: ${query}`,
      args: { query },
    });
    const results = await webSearch(query);
    ctx.emit({
      type: "tool_result",
      tool: "web_search",
      label: `Searching: ${query}`,
      summary: `${results.length} results`,
    });
    if (results.length === 0) {
      return { content: `No results found for "${query}".` };
    }
    const rendered = results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`,
      )
      .join("\n\n");
    return { content: `Search results for "${query}":\n\n${rendered}` };
  }

  if (name === "fetch_page") {
    const url = String(args.url ?? "").trim();
    ctx.emit({
      type: "tool_call",
      tool: "fetch_page",
      label: `Reading source: ${url}`,
      args: { url },
    });
    try {
      const page = await fetchPage(url);
      ctx.emit({
        type: "tool_result",
        tool: "fetch_page",
        label: `Reading source: ${page.title}`,
        summary: `${page.text.length} chars from ${page.url}`,
      });
      return {
        content: `Title: ${page.title}\nURL: ${page.url}\n\n${page.text}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      ctx.emit({
        type: "tool_result",
        tool: "fetch_page",
        label: `Reading source: ${url}`,
        summary: `failed: ${msg}`,
      });
      return { content: `Could not read ${url}: ${msg}` };
    }
  }

  if (name === "generate_pdf_report") {
    const title = String(args.title ?? "Research report").trim() || "Research report";
    const markdown = String(args.markdown_content ?? "");
    ctx.emit({
      type: "tool_call",
      tool: "generate_pdf_report",
      label: `Generating PDF report: ${title}`,
      args: { title },
    });
    try {
      const buffer = await generateReportPdf(title, markdown);

      // Insert the artifact row first to get an id for the storage path.
      const { data: inserted, error: insertErr } = await ctx.service
        .from("artifacts")
        .insert({
          chat_id: ctx.chatId,
          message_id: ctx.assistantMessageId,
          type: "pdf_report",
          storage_path: "pending",
          title,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        throw new Error(insertErr?.message ?? "failed to record artifact");
      }
      const artifactId = inserted.id as string;
      const storagePath = `${ctx.userId}/${ctx.chatId}/${artifactId}.pdf`;

      const { error: uploadErr } = await ctx.service.storage
        .from(REPORTS_BUCKET)
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadErr) {
        throw new Error(uploadErr.message);
      }

      await ctx.service
        .from("artifacts")
        .update({ storage_path: storagePath })
        .eq("id", artifactId);

      const downloadUrl = `${ctx.siteUrl}/api/artifacts/${artifactId}`;
      ctx.emit({
        type: "artifact",
        artifactId,
        title,
        downloadUrl,
      });
      ctx.emit({
        type: "tool_result",
        tool: "generate_pdf_report",
        label: `Generated PDF report: ${title}`,
        summary: "ready to download",
      });
      return {
        content: `The PDF report "${title}" has been generated and is ready for the user to download at ${downloadUrl}. Tell the user the report is ready.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pdf generation failed";
      ctx.emit({
        type: "tool_result",
        tool: "generate_pdf_report",
        label: `Generating PDF report: ${title}`,
        summary: `failed: ${msg}`,
      });
      return { content: `Failed to generate the PDF report: ${msg}` };
    }
  }

  return { content: `Unknown tool: ${name}` };
}
