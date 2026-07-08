import React from "react";
import { cn } from "@/lib/utils";

export default function KpiSkeleton({ className, dense = true }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg border border-border bg-card shadow-sm",
        dense ? "min-h-[4.25rem] p-1.5" : "min-h-[5.5rem] p-3",
        className
      )}
    >
      <div className="h-2.5 w-16 rounded bg-muted" />
      <div className={cn("rounded bg-muted", dense ? "mt-1.5 h-5 w-20" : "mt-2 h-7 w-24")} />
      <div className="mt-1 h-2 w-24 rounded bg-muted/80" />
    </div>
  );
}
