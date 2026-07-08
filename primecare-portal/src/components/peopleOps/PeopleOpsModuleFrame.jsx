import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import { KpiSkeleton } from "@/components/ux";

/**
 * Unified module layout: header → summary → filters → content (+ optional aside).
 */
export default function PeopleOpsModuleFrame({
  title,
  description = "",
  context = null,
  actions = null,
  summary = null,
  summaryLoading = false,
  filters = null,
  children,
  aside = null,
  className,
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className={typography.sectionTitle}>{title}</h2>
          {description ? <p className={typography.pageSubtitle}>{description}</p> : null}
          {context ? <div className="pt-1">{context}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {summaryLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      ) : summary ? (
        <div>{summary}</div>
      ) : null}

      {filters}

      <div className={cn(aside ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]" : "")}>
        <div className="min-w-0 space-y-4">{children}</div>
        {aside ? <aside className="space-y-4">{aside}</aside> : null}
      </div>
    </div>
  );
}
