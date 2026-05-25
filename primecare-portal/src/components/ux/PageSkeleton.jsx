import React from "react";
import { cn } from "@/lib/utils";
import KpiCardGrid from "./KpiCardGrid";
import KpiSkeleton from "./KpiSkeleton";
import ListSkeleton from "./ListSkeleton";

/**
 * @param {{
 *   kpiCount?: number,
 *   kpiColumns?: 2 | 3 | 4 | 6,
 *   showList?: boolean,
 *   listRows?: number,
 *   className?: string,
 * }} props
 */
export default function PageSkeleton({
  kpiCount = 4,
  kpiColumns = 4,
  showList = true,
  listRows = 4,
  className,
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="animate-pulse space-y-2">
        <div className="h-7 w-48 max-w-full rounded-lg bg-muted" />
        <div className="h-4 w-72 max-w-full rounded bg-muted/80" />
      </div>

      <KpiCardGrid columns={kpiColumns}>
        {Array.from({ length: kpiCount }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </KpiCardGrid>

      {showList ? (
        <div className="animate-pulse rounded-2xl border border-border bg-card p-4">
          <div className="mb-4 h-5 w-36 rounded bg-muted" />
          <ListSkeleton rows={listRows} />
        </div>
      ) : null}
    </div>
  );
}
