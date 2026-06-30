import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function ShipmentTimeline({ steps = [] }) {
  if (!steps.length) {
    return <p className="text-xs text-slate-500">No shipment timeline yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
              step.done
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : step.active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-400"
            )}
          >
            {step.done ? <Check className="h-3 w-3" /> : null}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-xs font-medium",
                step.active ? "text-indigo-700" : step.done ? "text-slate-800" : "text-slate-500"
              )}
            >
              {step.label}
            </p>
            {step.at ? (
              <p className="text-[10px] text-slate-500">
                {new Date(step.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
