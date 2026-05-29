import React from "react";
import { StatusBadge } from "@/components/ux";
import InterventionActionBar from "@/components/executive/InterventionActionBar.jsx";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

const SEVERITY_STYLES = {
  CRITICAL: "border-red-300 bg-red-50/90",
  ATTENTION: "border-amber-300 bg-amber-50/70",
  MONITORING: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_BADGE = { CRITICAL: "danger", ATTENTION: "warning", MONITORING: "neutral" };

const STATE_LABELS = {
  NEW: "New",
  ACKNOWLEDGED: "Acknowledged",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
};

function formatDuration(ms) {
  if (!ms || ms < 0) return "";
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function InterventionQueueCard({
  item,
  founder = false,
  compact = false,
  onOpen,
  onAction,
  busyAction = "",
  actionsDisabled = false,
}) {
  const sev = item.displaySeverity || item.severity;
  const state = item.workflowState || "NEW";

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer rounded-lg border shadow-sm transition hover:shadow-md",
        compact ? "px-2 py-1.5" : "px-2.5 py-2",
        founder && !compact ? "border-2 border-slate-800/20 bg-white" : SEVERITY_STYLES[sev] || SEVERITY_STYLES.MONITORING
      )}
      onClick={() => onOpen?.(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(item);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {founder ? <Crown className="h-3.5 w-3.5 text-amber-600" /> : null}
            <span className="text-xs font-semibold text-slate-900">{item.title}</span>
            <StatusBadge variant={SEVERITY_BADGE[sev] || "neutral"} compact>
              {sev}
            </StatusBadge>
            {!compact ? (
              <StatusBadge variant={state === "ESCALATED" ? "danger" : "neutral"} compact>
                {STATE_LABELS[state] || state}
              </StatusBadge>
            ) : null}
            {item.ageLabel || item.escalationAge ? (
              <span className="text-[10px] text-slate-500">
                {item.escalationAge || item.ageLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium">{item.subtitle}</p>
          {!compact ? (
            <>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
                {item.currentOwner ? <span>Owner · {item.currentOwner}</span> : null}
                {item.pendingActor ? <span>Waiting · {item.pendingActor}</span> : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-600">{item.summary}</p>
            </>
          ) : null}
        </div>
      </div>
      <div className={cn(compact ? "mt-1" : "mt-2")} onClick={(e) => e.stopPropagation()} role="presentation">
        <InterventionActionBar
          issue={item}
          onAction={onAction}
          compact
          busyAction={busyAction}
          disabled={actionsDisabled}
        />
      </div>
    </article>
  );
}
