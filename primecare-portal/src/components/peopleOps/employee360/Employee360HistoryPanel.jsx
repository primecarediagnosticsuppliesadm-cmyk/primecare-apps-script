import React from "react";
import { Flag, Zap } from "lucide-react";
import { StatusBadge } from "@/components/ux";
import { EMPLOYEE360_HISTORY_KIND } from "@/peopleOps/employee360/employee360WorkspaceModel.js";

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
  active: "success",
  ended: "neutral",
};

export default function Employee360HistoryPanel({ history, className }) {
  const items = history?.items || [];

  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">No history recorded for this employee yet.</p>
    );
  }

  return (
    <div className={className} data-testid="employee360-history">
      <div className="space-y-2">
        {items.map((item) => {
          const isMilestone = item.kind === EMPLOYEE360_HISTORY_KIND.MILESTONE;
          const Icon = isMilestone ? Flag : Zap;
          return (
            <div
              key={item.id}
              className="flex gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isMilestone ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                }`}
                title={isMilestone ? "Milestone" : "Activity"}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                  {item.category ? (
                    <StatusBadge variant={STATUS_VARIANT[item.category] || "neutral"} label={item.category} />
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.atLabel || "—"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
