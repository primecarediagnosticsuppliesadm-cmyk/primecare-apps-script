import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import KpiSkeleton from "./KpiSkeleton";

/**
 * @param {{
 *   title: string,
 *   value: React.ReactNode,
 *   subtitle?: string,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   trend?: { direction?: 'up' | 'down' | 'flat', label?: string },
 *   loading?: boolean,
 *   className?: string,
 *   dataTestId?: string,
 *   kpiRawValue?: number|null,
 *   highlight?: boolean,
 * }} props
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
  dense = false,
}) {
  if (loading) {
    return <KpiSkeleton className={className} />;
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
        "rounded-xl border border-border bg-card shadow-[var(--pc-shadow-card)] transition-shadow duration-200",
        dense ? "p-2.5" : "p-4",
        highlight && "ring-2 ring-emerald-400/70 shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={typography.kpiLabel}>{title}</div>
          <div
            className={cn(dense ? typography.kpiValueDense : typography.kpiValue, "mt-0.5 truncate")}
            data-testid={dataTestId}
            data-kpi-value={
              kpiRawValue !== null && kpiRawValue !== undefined
                ? String(kpiRawValue)
                : undefined
            }
          >
            {value}
          </div>
          {subtitle ? (
            <div className={cn(typography.kpiSubtitle, "mt-1")}>{subtitle}</div>
          ) : null}
          {trend?.label ? (
            <div className={cn("mt-1 text-xs font-medium", trendTone)}>
              {trend.label}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <div className={cn("shrink-0 rounded-lg bg-[var(--pc-neutral-bg)]", dense ? "p-1.5" : "p-2")}>
            <Icon className={cn("text-[var(--pc-brand-primary)]", dense ? "h-4 w-4" : "h-5 w-5")} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
