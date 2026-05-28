import React from "react";
import { StatusBadge } from "@/components/ux";
import OperationalTaskActionBar from "@/components/operational/OperationalTaskActionBar.jsx";
import { cn } from "@/lib/utils";
import { Camera, Clock, Link2 } from "lucide-react";

const SEVERITY_STYLES = {
  CRITICAL: "border-red-300 bg-red-50/90",
  ATTENTION: "border-amber-300 bg-amber-50/70",
  MONITORING: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_BADGE = { CRITICAL: "danger", ATTENTION: "warning", MONITORING: "neutral" };

const STATE_LABELS = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  BLOCKED: "Blocked",
  ESCALATED: "Escalated",
  COMPLETED: "Completed",
  REOPENED: "Reopened",
};

export default function OperationalTaskCard({
  task,
  variant = "executive",
  onOpen,
  onAction,
  onQuickAction,
}) {
  const sev = task.displaySeverity || task.severity;
  const state = task.resolutionStatus || "OPEN";

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer rounded-lg border px-2.5 py-2 shadow-sm transition hover:shadow-md",
        SEVERITY_STYLES[sev] || SEVERITY_STYLES.MONITORING,
        task.overdue && "ring-1 ring-red-400/60"
      )}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(task);
        }
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-semibold text-slate-900">{task.title}</span>
          <StatusBadge variant={SEVERITY_BADGE[sev] || "neutral"} compact>
            {sev}
          </StatusBadge>
          <StatusBadge variant={state === "ESCALATED" ? "danger" : "neutral"} compact>
            {STATE_LABELS[state] || state}
          </StatusBadge>
          {task.overdue ? (
            <span className="text-[10px] font-medium text-red-700">Overdue</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium">{task.linkedLabName || "—"}</p>
        <p className="line-clamp-2 text-[11px] text-slate-600">{task.summary}</p>
        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
          {task.assignee || task.owner ? <span>Owner · {task.assignee || task.owner}</span> : null}
          {task.dueDate ? (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              Due {String(task.dueDate).slice(0, 10)}
            </span>
          ) : null}
          {task.linkedInterventionId ? (
            <span className="inline-flex items-center gap-0.5 text-indigo-700">
              <Link2 className="h-3 w-3" />
              Intervention
            </span>
          ) : null}
          {task.hasProof ? (
            <span className="inline-flex items-center gap-0.5 text-cyan-700">
              <Camera className="h-3 w-3" />
              Proof
            </span>
          ) : null}
        </div>
      </div>
      {variant === "agent" && onQuickAction ? (
        <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
          <button
            type="button"
            className="rounded-md border bg-white px-2 py-1 text-[10px] font-medium"
            onClick={() => onQuickAction("visit", task)}
          >
            Log visit
          </button>
          <button
            type="button"
            className="rounded-md border bg-white px-2 py-1 text-[10px] font-medium"
            onClick={() => onQuickAction("collection", task)}
          >
            Collection
          </button>
          <button
            type="button"
            className="rounded-md border bg-white px-2 py-1 text-[10px] font-medium"
            onClick={() => onQuickAction("proof", task)}
          >
            Upload proof
          </button>
        </div>
      ) : null}
      <div className="mt-2" onClick={(e) => e.stopPropagation()} role="presentation">
        <OperationalTaskActionBar task={task} variant={variant} onAction={onAction} />
      </div>
    </article>
  );
}
