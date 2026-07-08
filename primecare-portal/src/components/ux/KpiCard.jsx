import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import KpiSkeleton from "./KpiSkeleton";

/**
 * RC4 — Standardized enterprise KPI card (dense default, fixed height).
 */
export default function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  loading = false,
  className,
  dataTestId,
  kpiRawValue,
  highlight = false,
  dense = true,
  refreshing = false,
}) {
  if (loading) {
    return <KpiSkeleton dense={dense} className={className} />;
  }

  const trendTone =
    trend?.direction === "up"
      ? "text-[var(--pc-success)]"
      : trend?.direction === "down"
        ? "text-[var(--pc-danger)]"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md",
        dense ? "min-h-[4.25rem] p-1.5" : "min-h-[5.5rem] p-3",
        highlight && "ring-1 ring-[var(--pc-brand-primary)]/40",
        refreshing && "animate-pulse opacity-90",
        className
      )}
    >
      <div className="flex h-full items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={typography.kpiLabel}>{title}</div>
          <div
            className={cn(dense ? "text-base font-semibold tabular-nums" : typography.kpiValue, "mt-0.5 truncate text-foreground")}
            data-testid={dataTestId}
            data-kpi-value={
              kpiRawValue !== null && kpiRawValue !== undefined ? String(kpiRawValue) : undefined
            }
          >
            {value}
          </div>
          {subtitle ? <div className={cn(typography.kpiSubtitle, "mt-0.5 line-clamp-2")}>{subtitle}</div> : null}
          {trend?.label ? (
            <div className={cn("mt-0.5 text-[10px] font-medium", trendTone)}>{trend.label}</div>
          ) : null}
        </div>
        {Icon ? (
          <div className={cn("shrink-0 rounded-md bg-[var(--pc-neutral-bg)]", dense ? "p-1" : "p-1.5")}>
            <Icon className={cn("text-[var(--pc-brand-primary)]", dense ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden />
          </div>
        ) : null}
      </div>
    </div>
  );
}
