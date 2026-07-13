import React from "react";
import { cn } from "@/lib/utils";

/**
 * Visual frame for a single-purpose Collections workspace.
 */
export default function CollectionsWorkspaceShell({
  workspaceId,
  title,
  primaryQuestion,
  workspaceLabel,
  children,
  className,
  hideHeader = false,
}) {
  return (
    <section
      data-workspace={workspaceId}
      aria-label={workspaceLabel}
      className={cn("space-y-3", className)}
    >
      {hideHeader ? null : (
        <header className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {workspaceLabel}
          </p>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{primaryQuestion}</p>
        </header>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
