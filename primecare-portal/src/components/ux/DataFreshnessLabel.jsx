import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function formatFreshness(loadedAt, refreshing) {
  if (refreshing) return "Refreshing…";
  if (!loadedAt) return null;
  const sec = Math.max(0, Math.floor((Date.now() - loadedAt) / 1000));
  if (sec < 8) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  return `Updated ${Math.floor(min / 60)}h ago`;
}

/**
 * Lightweight “last updated” label for cached read surfaces.
 * @param {{ loadedAt?: number|null, refreshing?: boolean, className?: string }} props
 */
export default function DataFreshnessLabel({ loadedAt = null, refreshing = false, className }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!loadedAt || refreshing) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [loadedAt, refreshing]);

  const label = formatFreshness(loadedAt, refreshing);
  void tick;

  if (!label) return null;

  return (
    <span
      className={cn(
        "text-[11px] font-medium text-muted-foreground tabular-nums",
        refreshing && "text-[var(--pc-info)]",
        className
      )}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
