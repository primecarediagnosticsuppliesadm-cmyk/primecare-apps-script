import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { buildOperationalLabSnapshot } from "@/operations/operationsCommandCenterModel.js";
import { buildOperationalTaskTimeline } from "@/operations/operationalTaskWorkflow.js";
import OperationalTaskActionBar from "@/components/operational/OperationalTaskActionBar.jsx";
import VisitEvidenceChips from "@/components/evidence/VisitEvidenceChips.jsx";
import { cn } from "@/lib/utils";
import { X, Clock3, Link2 } from "lucide-react";

function formatWhen(iso) {
  if (!iso) return "Recently";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const SEVERITY_DOT = {
  CRITICAL: "bg-red-500",
  ATTENTION: "bg-amber-500",
  MONITORING: "bg-slate-400",
};

export default function OperationalTaskDrawer({
  open,
  onClose,
  task,
  variant = "executive",
  opsPayload,
  tenantId = "",
  onAction,
  onOpenIntervention,
  onOpenLab,
}) {
  const labId = task?.linkedLabId;

  const labSnapshot = useMemo(() => {
    if (!labId || !opsPayload) return null;
    return buildOperationalLabSnapshot(opsPayload, labId);
  }, [labId, opsPayload]);

  const timeline = useMemo(() => {
    if (!task) return [];
    return buildOperationalTaskTimeline(task, opsPayload || {}, { tenantId });
  }, [task, opsPayload, tenantId]);

  const linkedEvidence = useMemo(() => {
    if (!labId || !opsPayload?.evidence) return [];
    return opsPayload.evidence.filter((e) => String(e.labId) === String(labId)).slice(0, 8);
  }, [labId, opsPayload?.evidence]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !task) return null;

  const sev = task.displaySeverity || task.severity;

  return (
    <div className="fixed inset-0 z-[61]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[94vh] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Operational task
              </p>
              <h2 className="truncate text-sm font-semibold">{task.taskTypeLabel || task.title}</h2>
              <div className="mt-1 flex flex-wrap gap-1">
                <StatusBadge variant={sev === "CRITICAL" ? "danger" : sev === "ATTENTION" ? "warning" : "neutral"} compact>
                  {sev}
                </StatusBadge>
                <StatusBadge variant="neutral" compact>
                  {task.resolutionStatus}
                </StatusBadge>
                {task.linkedInterventionId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 underline"
                    onClick={() => onOpenIntervention?.(task.linkedInterventionId)}
                  >
                    <Link2 className="h-3 w-3" />
                    Intervention
                  </button>
                ) : null}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="text-[11px] text-slate-600">{task.summary}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border px-2 py-1.5">
              <p className="text-slate-500">Lab</p>
              <p className="font-medium">{task.linkedLabName || "—"}</p>
              {labId ? (
                <button type="button" className="text-[10px] text-blue-600 underline" onClick={() => onOpenLab?.(labId)}>
                  Open lab
                </button>
              ) : null}
            </div>
            <div className="rounded border px-2 py-1.5">
              <p className="text-slate-500">Owner</p>
              <p className="font-medium">{task.assignee || task.owner || "Unassigned"}</p>
            </div>
            <div className="rounded border px-2 py-1.5">
              <p className="text-slate-500">Due</p>
              <p className="font-medium inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" />
                {task.dueDate ? String(task.dueDate).slice(0, 10) : "—"}
              </p>
            </div>
          </div>

          {labSnapshot?.visits?.length ? (
            <div className="mt-3">
              <h3 className="text-xs font-semibold">Visit evidence</h3>
              <ul className="mt-1 space-y-1">
                {labSnapshot.visits.slice(0, 3).map((v) => (
                  <li key={v.visitId || v.id} className="rounded border px-2 py-1.5 text-[11px]">
                    <VisitEvidenceChips
                      visitId={v.visitId || v.id}
                      labId={labId}
                      allEvidence={opsPayload?.evidence || []}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {linkedEvidence.length ? (
            <div className="mt-3">
              <h3 className="text-xs font-semibold">Linked proof</h3>
              <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                {linkedEvidence.map((ev) => (
                  <li key={ev.evidenceId}>{ev.fileName || ev.kind}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <h3 className="mt-4 text-xs font-semibold">Task timeline</h3>
          <ul className="mt-2">
            {timeline.map((ev) => (
              <li key={ev.id} className="relative flex gap-2 pb-3 pl-3">
                <span
                  className={cn(
                    "absolute left-0 top-1.5 h-2 w-2 rounded-full",
                    SEVERITY_DOT[ev.severity] || SEVERITY_DOT.MONITORING
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-1">
                    <span className="text-[11px] font-semibold capitalize">{ev.label}</span>
                    <span className="text-[10px] text-slate-500">{formatWhen(ev.at)}</span>
                  </div>
                  <p className="text-[10px] text-slate-600">{ev.detail}</p>
                  {ev.actor ? <p className="text-[10px] text-slate-400">{ev.actor}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="sticky bottom-0 border-t bg-white px-3 py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <OperationalTaskActionBar task={task} variant={variant} onAction={onAction} compact={false} />
        </footer>
      </div>
    </div>
  );
}
