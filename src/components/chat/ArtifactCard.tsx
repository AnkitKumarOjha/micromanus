"use client";

import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

export function ArtifactCard({
  artifactId,
  title,
}: {
  artifactId: string;
  title: string;
}) {
  const href = `/api/artifacts/${artifactId}`;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">PDF report · artifact</p>
      </div>
      <a href={href} target="_blank" rel="noreferrer">
        <Button size="sm" variant="outline">
          <Download className="h-4 w-4" /> Download
        </Button>
      </a>
    </div>
  );
}
