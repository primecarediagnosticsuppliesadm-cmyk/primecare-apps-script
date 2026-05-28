import React from "react";
import { cn } from "@/lib/utils";

const SEVERITY_DOT = {
  CRITICAL: "bg-red-500",
  ATTENTION: "bg-amber-500",
  MONITORING: "bg-slate-400",
};

function formatWhen(iso) {
  if (!iso) return "Recently";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Compact operational timeline rows (shared across drawers and audit).
 */
export default function OperationalTimelineList({ events = [], className, emptyLabel = "No events" }) {
  if (!events.length) {
    return <p className={cn("py-4 text-center text-xs text-slate-500", className)}>{emptyLabel}</p>;
  }

  return (
    <ul className={cn("space-y-0", className)}>
      {events.map((ev) => (
        <li key={ev.id} className="relative flex gap-2 pb-3 pl-3">
          <span
            className={cn(
              "absolute left-0 top-1.5 h-2 w-2 rounded-full",
              SEVERITY_DOT[ev.severity] || SEVERITY_DOT.MONITORING
            )}
          />
          <span className="absolute bottom-0 left-[3px] top-3 w-px bg-slate-200 last:hidden" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-1">
              <span className="text-[11px] font-semibold text-slate-900">
                {ev.label}
                {ev.compressed ? (
                  <span className="ml-1 font-normal text-slate-500">({ev.count})</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[10px] text-slate-500">{formatWhen(ev.at)}</span>
            </div>
            <p className="text-[10px] text-slate-600">{ev.detail}</p>
            {ev.actor ? <p className="text-[10px] text-slate-400">{ev.actor}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
