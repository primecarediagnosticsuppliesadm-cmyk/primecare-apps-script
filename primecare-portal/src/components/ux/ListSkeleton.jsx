import React from "react";
import { cn } from "@/lib/utils";

/**
 * @param {{ rows?: number, className?: string }} props
 */
export default function ListSkeleton({ rows = 5, className }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 max-w-full rounded bg-muted" />
              <div className="h-3 w-56 max-w-full rounded bg-muted/80" />
            </div>
            <div className="h-6 w-16 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
