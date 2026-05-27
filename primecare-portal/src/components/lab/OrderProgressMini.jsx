import React from "react";
import { cn } from "@/lib/utils";
import {
  TRACKING_STEPS,
  getTrackingStepIndex,
  isCancelledStatus,
} from "@/utils/orderTracking.js";

export default function OrderProgressMini({ status, className }) {
  const cancelled = isCancelledStatus(status);
  const index = cancelled ? -1 : getTrackingStepIndex(status);
  const currentLabel =
    cancelled ? "Cancelled" : TRACKING_STEPS[Math.max(0, index)]?.label || "Order Placed";
  const pct = cancelled ? 0 : ((index + 1) / TRACKING_STEPS.length) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span className="truncate">{currentLabel}</span>
        <span className="shrink-0 tabular-nums">
          {cancelled ? "—" : `${index + 1}/${TRACKING_STEPS.length}`}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            cancelled ? "bg-red-400" : "bg-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}