import React from "react";
import { EmptyState } from "@/components/ux";

export function WorkforceBudgetBarChart({ points = [], valueKey = "value", labelKey = "label", ariaLabel = "Chart" }) {
  const max = Math.max(...points.map((point) => Number(point[valueKey] || 0)), 1);
  if (!points.length) {
    return <EmptyState title="No chart data" description="Planning charts appear after payroll periods are available." />;
  }
  return (
    <div className="flex h-36 items-end gap-1.5" role="img" aria-label={ariaLabel}>
      {points.map((point) => (
        <div key={point[labelKey] || point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-[var(--pc-brand-primary)]/80"
            style={{ height: `${Math.max(6, (Number(point[valueKey] || 0) / max) * 100)}%` }}
            title={point.valueLabel || String(point[valueKey])}
          />
          <span className="truncate text-[10px] text-muted-foreground">{point[labelKey] || point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkforceBudgetCompareChart({ points = [] }) {
  if (!points.length) {
    return <EmptyState title="No comparison data" description="Budget vs actual requires payroll trend history." />;
  }
  const max = Math.max(...points.flatMap((row) => [row.budget, row.actual]), 1);
  return (
    <div className="space-y-2" role="img" aria-label="Budget versus actual payroll">
      {points.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{row.label}</span>
            <span>{row.actualLabel} / {row.budgetLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-[var(--pc-brand-primary)]" style={{ width: `${(row.actual / max) * 100}%` }} />
            </div>
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-emerald-500/80" style={{ width: `${(row.budget / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
