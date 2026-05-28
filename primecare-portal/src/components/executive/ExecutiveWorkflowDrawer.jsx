import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { buildOperationalLabSnapshot } from "@/operations/operationsCommandCenterModel.js";
import { buildInterventionTimeline } from "@/operations/executiveInterventionWorkflow.js";
import InterventionActionBar from "@/components/executive/InterventionActionBar.jsx";
import VisitEvidenceChips from "@/components/evidence/VisitEvidenceChips.jsx";
import { cn } from "@/lib/utils";
import { X, Clock3, User, Building2, AlertTriangle } from "lucide-react";

function formatWhen(iso) {
  if (!iso) return "Recently";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

const SEVERITY_DOT = {
  CRITICAL: "bg-red-500",
  ATTENTION: "bg-amber-500",
  MONITORING: "bg-slate-400",
};

/**
 * Executive intervention workflow drawer — no route navigation.
 */
export default function ExecutiveWorkflowDrawer({
  open,
  onClose,
  issue,
  opsPayload,
  tenantId = "",
  onAction,
  onOpenLab,
}) {
  const labId = issue?.labId;

  const labSnapshot = useMemo(() => {
    if (!labId || !opsPayload) return null;
    return buildOperationalLabSnapshot(opsPayload, labId);
  }, [labId, opsPayload]);

  const timeline = useMemo(() => {
    if (!issue) return [];
    return buildInterventionTimeline(issue, opsPayload || {}, { tenantId });
  }, [issue, opsPayload, tenantId]);

  const relatedCollections = useMemo(() => {
    if (!labId || !opsPayload?.collections) return [];
    return opsPayload.collections
      .filter((c) => String(c.labId || c.lab_id) === String(labId))
      .slice(0, 4);
  }, [labId, opsPayload?.collections]);

  const labEvidence = useMemo(() => {
    if (!labId || !opsPayload?.evidence) return [];
    return opsPayload.evidence
      .filter((e) => String(e.labId) === String(labId))
      .slice(0, 6);
  }, [labId, opsPayload?.evidence]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !issue) return null;

  const sev = issue.displaySeverity || issue.severity;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Intervention">
      <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col bg-white shadow-xl",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[94vh] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b bg-white px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Executive intervention
            </p>
            <h2 className="truncate text-sm font-semibold">{issue.title}</h2>
            <div className="mt-1 flex flex-wrap gap-1">
              <StatusBadge variant={sev === "CRITICAL" ? "danger" : sev === "ATTENTION" ? "warning" : "neutral"} compact>
                {sev}
              </StatusBadge>
              <StatusBadge variant="neutral" compact>
                {issue.workflowState || "NEW"}
              </StatusBadge>
              {issue.ageLabel || issue.escalationAge ? (
                <span className="text-[10px] text-slate-500">
                  <Clock3 className="mr-0.5 inline h-3 w-3" />
                  {issue.escalationAge || issue.ageLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto border-b p-3 lg:border-b-0 lg:border-r">
            <section className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">Issue summary</h3>
                <p className="mt-1 text-[11px] text-slate-600">{issue.summary}</p>
                {issue.recommendedAction ? (
                  <p className="mt-1 text-[11px] font-medium text-slate-800">
                    Next · {issue.recommendedAction}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {issue.labName ? (
                  <div className="rounded border bg-slate-50 px-2 py-1.5">
                    <Building2 className="mb-0.5 h-3.5 w-3.5 text-slate-500" />
                    <p className="font-medium">{issue.labName}</p>
                    {labId ? (
                      <button
                        type="button"
                        className="text-[10px] text-blue-600 underline"
                        onClick={() => onOpenLab?.(labId)}
                      >
                        Open lab record
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {issue.currentOwner || issue.owner ? (
                  <div className="rounded border bg-slate-50 px-2 py-1.5">
                    <User className="mb-0.5 h-3.5 w-3.5 text-slate-500" />
                    <p className="text-[10px] text-slate-500">Owner</p>
                    <p className="font-medium">{issue.currentOwner || issue.owner}</p>
                  </div>
                ) : null}
                {issue.pendingActor ? (
                  <div className="rounded border bg-amber-50 px-2 py-1.5">
                    <AlertTriangle className="mb-0.5 h-3.5 w-3.5 text-amber-600" />
                    <p className="text-[10px] text-slate-500">Waiting on</p>
                    <p className="font-medium">{issue.pendingActor}</p>
                  </div>
                ) : null}
                {issue.escalatedBy ? (
                  <div className="rounded border bg-red-50 px-2 py-1.5">
                    <p className="text-[10px] text-slate-500">Escalated by</p>
                    <p className="font-medium">{issue.escalatedBy}</p>
                  </div>
                ) : null}
              </div>

              {labSnapshot ? (
                <div>
                  <h3 className="text-xs font-semibold">Operational metrics</h3>
                  <dl className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <div className="rounded border px-2 py-1">
                      <dt className="text-slate-500">Outstanding</dt>
                      <dd className="font-semibold">{formatCurrency(labSnapshot.outstanding)}</dd>
                    </div>
                    <div className="rounded border px-2 py-1">
                      <dt className="text-slate-500">Visits (30d)</dt>
                      <dd className="font-semibold">{labSnapshot.visits?.length ?? 0}</dd>
                    </div>
                    <div className="rounded border px-2 py-1">
                      <dt className="text-slate-500">Orders open</dt>
                      <dd className="font-semibold">{labSnapshot.orders?.length ?? 0}</dd>
                    </div>
                    <div className="rounded border px-2 py-1">
                      <dt className="text-slate-500">Collection risk</dt>
                      <dd className="font-semibold capitalize">{labSnapshot.collectionRisk || "—"}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {labSnapshot?.visits?.length ? (
                <div>
                  <h3 className="text-xs font-semibold">Recent visits & proof</h3>
                  <ul className="mt-1 space-y-1">
                    {labSnapshot.visits.slice(0, 4).map((v) => (
                      <li key={v.visitId || v.id} className="rounded border px-2 py-1.5 text-[11px]">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{v.visitType || "Visit"}</span>
                          <span className="text-slate-500">{v.visitDate || v.date}</span>
                        </div>
                        <p className="text-slate-500">{v.agent || v.agentName}</p>
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

              {relatedCollections.length ? (
                <div>
                  <h3 className="text-xs font-semibold">Collections</h3>
                  <ul className="mt-1 space-y-0.5 text-[11px]">
                    {relatedCollections.map((c) => (
                      <li key={c.collectionId || c.id} className="flex justify-between rounded border px-2 py-1">
                        <span>{formatCurrency(c.amount || c.collectionAmount)}</span>
                        <span className="text-slate-500">{c.status || c.collectionStatus}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {labEvidence.length ? (
                <div>
                  <h3 className="text-xs font-semibold">Evidence</h3>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                    {labEvidence.map((ev) => (
                      <li key={ev.evidenceId}>{ev.fileName || ev.kind}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>

          <div className="flex w-full flex-col border-t lg:w-[min(340px,42%)] lg:border-t-0 lg:border-l">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <h3 className="text-xs font-semibold">Intervention timeline</h3>
              <ul className="mt-2 space-y-0">
                {timeline.map((ev) => (
                  <li key={ev.id} className="relative flex gap-2 pb-3 pl-3">
                    <span
                      className={cn(
                        "absolute left-0 top-1.5 h-2 w-2 rounded-full",
                        SEVERITY_DOT[ev.severity] || SEVERITY_DOT.MONITORING
                      )}
                    />
                    <span className="absolute bottom-0 left-[3px] top-3 w-px bg-slate-200" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-1">
                        <span className="text-[11px] font-semibold capitalize text-slate-900">
                          {ev.label}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-500">{formatWhen(ev.at)}</span>
                      </div>
                      <p className="text-[10px] text-slate-600">{ev.detail}</p>
                      {ev.actor ? (
                        <p className="text-[10px] text-slate-400">{ev.actor}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>

              {(issue.interventionRecord?.history || []).length ? (
                <div className="mt-4 border-t pt-3">
                  <h3 className="text-xs font-semibold">Assignment history</h3>
                  <ul className="mt-1 space-y-1 text-[10px] text-slate-600">
                    {issue.interventionRecord.history
                      .slice()
                      .reverse()
                      .slice(0, 8)
                      .map((h) => (
                        <li key={`${h.at}-${h.action}`}>
                          {h.actor} · {h.action.replaceAll("_", " ")} · {formatWhen(h.at)}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="sticky bottom-0 border-t bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <InterventionActionBar issue={issue} onAction={onAction} />
        </footer>
      </div>
    </div>
  );
}
