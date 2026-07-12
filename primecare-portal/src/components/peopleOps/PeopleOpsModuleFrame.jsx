import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import { KpiSkeleton } from "@/components/ux";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsPageHelp from "@/components/peopleOps/PeopleOpsPageHelp.jsx";

/**
 * RC4/RC5 — Unified module layout: header → KPIs → filters → primary work → supporting insights.
 */
export default function PeopleOpsModuleFrame({
  title,
  description = "",
  breadcrumbs = null,
  onBreadcrumbNavigate = null,
  context = null,
  actions = null,
  summary = null,
  summaryLoading = false,
  filters = null,
  children,
  aside = null,
  className,
  dense = false,
  helpModuleId = null,
}) {
  return (
    <div className={cn(dense ? "space-y-1.5" : "space-y-2", className)}>
      <header className={cn("flex flex-wrap items-start justify-between gap-1.5 border-b border-border", dense ? "pb-1.5" : "pb-2")}>
        <div className="min-w-0 flex-1 space-y-0.5">
          {breadcrumbs ? (
            <PeopleOpsBreadcrumbs
              items={breadcrumbs}
              onNavigate={onBreadcrumbNavigate}
              className="mb-0.5"
            />
          ) : null}
          <h2 className={typography.pageTitle}>{title}</h2>
          {description ? <p className={typography.pageSubtitle}>{description}</p> : null}
          {context ? <div className="pt-0.5">{context}</div> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {helpModuleId ? <PeopleOpsPageHelp moduleId={helpModuleId} /> : null}
          {actions}
        </div>
      </header>

      {summaryLoading ? (
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <KpiSkeleton key={index} dense />
          ))}
        </div>
      ) : summary ? (
        <div className="space-y-1.5">{summary}</div>
      ) : null}

      {filters}

      <div className={cn(aside ? "grid gap-2 xl:grid-cols-[minmax(0,1fr)_15rem]" : "")}>
        <div className={cn("min-w-0", dense ? "space-y-1.5" : "space-y-2")}>{children}</div>
        {aside ? <aside className="space-y-2">{aside}</aside> : null}
      </div>
    </div>
  );
}
