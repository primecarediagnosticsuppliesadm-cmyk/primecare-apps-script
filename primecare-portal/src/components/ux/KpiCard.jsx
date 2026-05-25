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
        "rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={typography.kpiLabel}>{title}</div>
          <div className={cn(typography.kpiValue, "mt-1 truncate")}>{value}</div>
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
          <div className="shrink-0 rounded-xl bg-[var(--pc-neutral-bg)] p-2">
            <Icon className="h-5 w-5 text-[var(--pc-brand-primary)]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
