import React from "react";
import { cn } from "@/lib/utils";

const STATUS_DOT = {
  PASS: "bg-emerald-500",
  WARN: "bg-amber-500",
  FAIL: "bg-red-500",
};

const PHASE_COLORS = {
  Auth: "border-violet-400/50 bg-violet-500/5",
  DB: "border-blue-400/50 bg-blue-500/5",
  API: "border-cyan-400/50 bg-cyan-500/5",
  Compute: "border-orange-400/50 bg-orange-500/5",
  Cache: "border-slate-400/50 bg-slate-500/5",
  UI: "border-emerald-400/50 bg-emerald-500/5",
};

/**
 * Auth → DB → API → Compute → UI timeline with durations and pass/fail markers.
 */
export default function PredatorTimeline({ steps = [], title = "Debug timeline" }) {
  if (!steps.length) {
    return (
      <p className="text-xs text-muted-foreground">No timeline steps recorded yet for this module.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="relative space-y-0 border-l-2 border-border pl-4">
        {steps.map((step, idx) => (
          <li key={`${step.phase}-${step.label}-${idx}`} className="relative pb-4 last:pb-0">
            <span
              className={cn(
                "absolute -left-[1.15rem] top-1 h-3 w-3 rounded-full ring-2 ring-card",
                STATUS_DOT[step.status] || STATUS_DOT.PASS
              )}
            />
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                PHASE_COLORS[step.phase] || "border-border bg-card"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {step.phase} · {step.label}
                </span>
                {step.durationMs != null ? (
                  <span className="font-mono text-muted-foreground">{step.durationMs}ms</span>
                ) : null}
              </div>
              {step.rowsReturned != null ? (
                <p className="mt-1 text-muted-foreground">rows: {step.rowsReturned}</p>
              ) : null}
              {step.payloadBytes != null ? (
                <p className="text-muted-foreground">payload: {step.payloadBytes} bytes</p>
              ) : null}
              {step.detail ? (
                <pre className="mt-1 max-h-20 overflow-auto font-mono text-[10px] opacity-80">
                  {JSON.stringify(step.detail, null, 2)}
                </pre>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
