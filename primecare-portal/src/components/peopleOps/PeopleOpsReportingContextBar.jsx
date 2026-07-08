import React from "react";
import { StatusBadge } from "@/components/ux";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";

/**
 * RC4 — Single reusable reporting context control (period / version / status).
 * Used by the universal Context widget — no duplicate rendering elsewhere.
 */
export default function PeopleOpsReportingContextBar({
  context,
  contextSummary = null,
  periodOptions = [],
  runOptions = [],
  selectedPeriodId,
  selectedRunId,
  onPeriodChange,
  onRunChange,
  lastRefreshLabel = "",
  compact = false,
  className,
}) {
  const reporting = context || contextSummary?.reportingContext || contextSummary;
  if (!reporting && !periodOptions.length) return null;

  const status = contextSummary?.payrollStatus || reporting?.status || reporting?.statusLabel;
  const statusLabel = reporting?.statusLabel || String(status || "—");

  return (
    <div
      className={cn(
        compact ? "space-y-1.5" : enterpriseLayout.stickyToolbar,
        "top-0 z-20",
        className
      )}
      role="region"
      aria-label="Reporting context"
    >
      <div className={cn("flex flex-wrap items-end gap-1", compact ? "" : "gap-1.5")}>
        {periodOptions.length ? (
          <label className="min-w-[6.5rem] flex-1 space-y-0.5">
            <span className={typography.kpiLabel}>Period</span>
            <select
              className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-[11px]"
              value={selectedPeriodId || reporting?.periodId || ""}
              onChange={(event) => onPeriodChange?.(event.target.value)}
              aria-label="Payroll period"
            >
              {periodOptions.map((row) => (
                <option key={row.periodId} value={row.periodId}>
                  {row.periodYm}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="min-w-0 flex-1">
            <p className={typography.kpiLabel}>Period</p>
            <p className={cn(typography.kpiValueDense, "text-sm")}>{contextSummary?.periodLabel || reporting?.periodLabel || "—"}</p>
          </div>
        )}
        {runOptions.length ? (
          <label className="min-w-[6.5rem] flex-1 space-y-0.5">
            <span className={typography.kpiLabel}>Version</span>
            <select
              className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-[11px]"
              value={selectedRunId || reporting?.payrollRunId || ""}
              onChange={(event) => onRunChange?.(event.target.value)}
              disabled={!runOptions.length}
              aria-label="Payroll run version"
            >
              {runOptions.map((row) => (
                <option key={row.runId} value={row.runId}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="min-w-0 flex-1">
            <p className={typography.kpiLabel}>Version</p>
            <p className={cn(typography.kpiValueDense, "text-sm")}>
              {contextSummary?.runVersionLabel || reporting?.runVersionLabel || "Not selected"}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <StatusBadge variant={PEOPLE_OPS_PAYROLL_STATUS_VARIANT[status] || "neutral"} label={statusLabel} />
        {contextSummary?.netPayrollLabel ? (
          <span className={cn(typography.kpiSubtitle, "font-medium tabular-nums text-foreground")}>
            Net {contextSummary.netPayrollLabel}
          </span>
        ) : null}
        {lastRefreshLabel ? (
          <span className={typography.kpiSubtitle}>Updated {lastRefreshLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
