import React from "react";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ux";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

/**
 * RC4 — Ownership coverage visualization (read-only).
 */
export default function OwnershipCoveragePanel({ dashboard, workspace }) {
  if (!dashboard) return null;

  const coveragePct = Number(dashboard.coveragePct) || 0;
  const gaps = dashboard.ownershipGaps || [];
  const orphanCount = dashboard.unassignedLabs ?? gaps.length;
  const complete = coveragePct >= 100 && !gaps.length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/10 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={typography.kpiLabel}>Ownership coverage</p>
          <p className={cn(typography.kpiValueDense, "text-base")}>{coveragePct}% complete</p>
        </div>
        <StatusBadge variant={complete ? "success" : orphanCount ? "warning" : "info"} label={complete ? "Complete" : `${orphanCount} orphan(s)`} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", complete ? "bg-[var(--pc-success)]" : "bg-[var(--pc-brand-primary)]")}
          style={{ width: `${Math.min(100, Math.max(0, coveragePct))}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>Unassigned labs: {dashboard.unassignedLabs ?? 0}</span>
        <span>Period: {workspace?.reportingContext?.periodYm || "Current"}</span>
        {gaps.length ? (
          <span className="inline-flex items-center gap-1 text-[var(--pc-warning)]">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {gaps.length} ownership gap(s)
          </span>
        ) : null}
      </div>
    </div>
  );
}
