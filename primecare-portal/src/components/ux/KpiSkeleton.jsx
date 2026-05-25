import React from "react";
import { cn } from "@/lib/utils";

export default function KpiSkeleton({ className }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]",
        className
      )}
    >
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="mt-2 h-7 w-24 rounded bg-muted" />
      <div className="mt-2 h-3 w-28 rounded bg-muted/80" />
    </div>
  );
}
