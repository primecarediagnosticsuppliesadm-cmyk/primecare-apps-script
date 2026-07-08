import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

/**
 * RC4 — Compact horizontal KPI strip.
 */
export default function EnterpriseMetricStrip({ items = [], className, refreshing = false }) {
  if (!items.length) return null;

  return (
    <div
      className={cn(
        enterpriseLayout.stickyToolbar,
        "grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        refreshing && "animate-pulse",
        className
      )}
      role="region"
      aria-label="Key metrics"
      aria-busy={refreshing || undefined}
    >
      {items.map((item) => (
        <div
          key={item.id || item.label}
          className="min-w-0 rounded-md border border-border/60 bg-background/80 px-2 py-1.5 transition-shadow hover:shadow-sm"
        >
          <p className={typography.kpiLabel}>{item.label}</p>
          <p className={cn("mt-0.5 truncate text-base font-semibold tabular-nums text-foreground")}>{item.value ?? "—"}</p>
          {item.hint ? <p className={cn(typography.kpiSubtitle, "mt-0.5 truncate")}>{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
