import React from "react";
import { cn } from "@/lib/utils";
import {
  TRACKING_STEPS,
  getTrackingStepIndex,
  isCancelledStatus,
} from "@/utils/orderTracking.js";

export default function OrderProgressMini({ status, className }) {
  const cancelled = isCancelledStatus(status);

  if (cancelled) {
    return (
      <div className={cn("text-[10px] font-semibold text-red-700", className)}>
        Cancelled
      </div>
    );
  }

  const index = getTrackingStepIndex(status);
  const currentLabel = TRACKING_STEPS[Math.max(0, index)]?.label || "Order Placed";
  const pct = ((index + 1) / TRACKING_STEPS.length) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span className="truncate">{currentLabel}</span>
        <span className="shrink-0 tabular-nums">
          {index + 1}/{TRACKING_STEPS.length}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
