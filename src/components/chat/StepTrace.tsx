"use client";

import { useState } from "react";
import type { AgentStep } from "@/lib/types";
import {
  Search,
  FileText,
  FileDown,
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

// The collapsible "reasoning steps" trail shown above an assistant answer:
// search queries run, pages read, PDF generated, interim thoughts.
export function StepTrace({
  steps,
  running,
}: {
  steps: AgentStep[];
  running?: boolean;
}) {
  // Collapsed by default (esp. on reload); the header conveys live progress.
  const [open, setOpen] = useState(false);

  // The panel only exists if the agent actually did research. A run with zero
  // tool steps (e.g. a direct reply to "hey") never mounts this panel — even
  // while running.
  const hasResearch = steps.some(
    (s) =>
      s.type === "tool_call" ||
      s.type === "tool_result" ||
      s.type === "artifact",
  );
  if (!hasResearch) return null;

  const visible = steps.filter(
    (s) =>
      s.type === "tool_call" ||
      s.type === "tool_result" ||
      s.type === "status" ||
      s.type === "artifact",
  );
  const count = visible.filter((s) => s.type === "tool_call").length;

  // While running, show the latest activity in the (collapsed) header so each
  // search/fetch is visible live without expanding.
  const activity = visible.filter(
    (s) =>
      s.type === "tool_call" ||
      s.type === "tool_result" ||
      s.type === "artifact",
  );
  const latest = activity[activity.length - 1];
  let latestLabel = "Researching…";
  if (latest) {
    if (latest.type === "artifact") latestLabel = `Generating report: ${latest.title}`;
    else latestLabel = latest.label;
  }

  return (
    <div className="mb-2 rounded-lg border bg-muted/40 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Brain className="h-4 w-4" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {running
            ? latestLabel
            : `Research steps (${count} tool call${count === 1 ? "" : "s"})`}
        </span>
      </button>
      {open && (
        <ol className="space-y-1 px-3 pb-3">
          {visible.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <StepIcon step={s} />
              <span className="min-w-0 flex-1 break-words">
                {renderStep(s)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepIcon({ step }: { step: AgentStep }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (step.type === "tool_call" || step.type === "tool_result") {
    if (step.tool === "web_search") return <Search className={cls} />;
    if (step.tool === "fetch_page") return <FileText className={cls} />;
    if (step.tool === "generate_pdf_report") return <FileDown className={cls} />;
  }
  if (step.type === "artifact") return <FileDown className={cls} />;
  return <Brain className={cls} />;
}

function renderStep(step: AgentStep) {
  switch (step.type) {
    case "tool_call":
      return <span className="text-muted-foreground">{step.label}</span>;
    case "tool_result":
      return (
        <span className="text-muted-foreground">
          {step.label} — <span className="opacity-70">{step.summary}</span>
        </span>
      );
    case "status":
      return <span className="italic text-muted-foreground">{step.text}</span>;
    case "artifact":
      return (
        <span className="text-muted-foreground">
          Report generated: {step.title}
        </span>
      );
    default:
      return null;
  }
}
