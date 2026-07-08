import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

/**
 * Compact horizontal KPI strip for executive command centers.
 */
export default function EnterpriseMetricStrip({ items = [], className }) {
  if (!items.length) return null;

  return (
    <div
      className={cn(
        enterpriseLayout.stickyToolbar,
        "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className
      )}
      role="region"
      aria-label="Key metrics"
    >
      {items.map((item) => (
        <div key={item.id || item.label} className="min-w-0 rounded-lg border border-border/60 bg-background/80 px-2.5 py-2">
          <p className={typography.kpiLabel}>{item.label}</p>
          <p className={cn(typography.kpiValueDense, "mt-0.5 truncate")}>{item.value ?? "—"}</p>
          {item.hint ? <p className={cn(typography.kpiSubtitle, "mt-0.5 truncate")}>{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
