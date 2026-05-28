import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { getLabQualificationRead } from "@/api/primecareSupabaseApi.js";
import { buildLabSnapshot } from "@/pages/agentDailyWorkspace.js";
import { priorityToBadgeVariant, queueTypeLabel } from "@/pages/agentDailyWorkspace.js";
import { collectionRiskToVariant } from "@/utils/statusTokens.js";
import { cn } from "@/lib/utils";
import {
  X,
  Loader2,
  IndianRupee,
  MapPin,
  CalendarClock,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";
import EvidenceContextActions from "@/components/evidence/EvidenceContextActions.jsx";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatWhen(iso) {
  if (!iso || iso === "-") return "—";
  const d = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.labId
 * @param {object} props.workspace
 * @param {(action: string, ctx: object) => void} props.onAction
 */
export default function AgentLabSnapshotDrawer({
  open,
  onClose,
  labId,
  workspace,
  onAction,
}) {
  const [qualification, setQualification] = useState(null);
  const [qualLoading, setQualLoading] = useState(false);

  const snapshot = useMemo(
    () => (labId && workspace ? buildLabSnapshot(workspace, labId) : null),
    [labId, workspace]
  );

  const lab = snapshot?.lab;
  const collection = snapshot?.collection;
  const visits = snapshot?.visits || [];
  const queueItem = snapshot?.queueItem;

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !labId) {
      setQualification(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setQualLoading(true);
      try {
        const res = await getLabQualificationRead({ labId });
        if (!cancelled) setQualification(res?.data || null);
      } catch {
        if (!cancelled) setQualification(null);
      } finally {
        if (!cancelled) setQualLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, labId]);

  if (!open) return null;

  const outstanding = Number(
    collection?.outstandingAmount ?? lab?.outstanding ?? lab?.outstandingAmount ?? 0
  );
  const overdueDays = Number(collection?.overdueDays ?? lab?.daysOverdue ?? 0);
  const riskStatus = collection?.riskStatus || lab?.creditStatus || "—";
  const lastCollection = collection?.lastFollowUp || collection?.lastPaymentDate || "—";
  const lastVisit = lab?.lastVisit || visits[0]?.visitDate || "—";
  const qualificationStage =
    qualification?.pipeline_stage ||
    qualification?.stage ||
    lab?.stage ||
    queueItem?.qualificationLabel ||
    "—";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Lab snapshot">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close lab snapshot"
      />
      <div
        className={cn(
          "absolute flex flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]",
          "inset-y-0 right-0 w-full max-w-[min(100vw,480px)]",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[min(90vh,680px)] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {snapshot?.labName || "Lab snapshot"}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {lab?.area ? (
                <>
                  <MapPin className="mr-0.5 inline h-3 w-3" />
                  {lab.area}
                </>
              ) : (
                "Field account"
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
          <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {queueItem ? (
                <>
                  <StatusBadge variant={priorityToBadgeVariant(queueItem.priority)} compact>
                    {queueItem.priority}
                  </StatusBadge>
                  <StatusBadge variant="info" compact>
                    {queueTypeLabel(queueItem.queueType)}
                  </StatusBadge>
                </>
              ) : null}
              <StatusBadge variant={collectionRiskToVariant(riskStatus)} compact>
                {riskStatus}
              </StatusBadge>
            </div>
            <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
              {formatCurrency(outstanding)}
              <span className="ml-1 text-xs font-normal text-slate-500">outstanding</span>
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>
                <dt className="text-slate-500">Overdue days</dt>
                <dd className="font-medium text-slate-900">{overdueDays}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last visit</dt>
                <dd className="font-medium text-slate-900">{formatWhen(lastVisit)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last collection</dt>
                <dd className="font-medium text-slate-900">{formatWhen(lastCollection)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Next follow-up</dt>
                <dd className="font-medium text-slate-900">{formatWhen(lab?.nextFollowUp)}</dd>
              </div>
            </dl>
            {queueItem?.reason ? (
              <p className="mt-2 text-xs text-slate-700">{queueItem.reason}</p>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 p-2.5">
            <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <IndianRupee className="h-3 w-3" />
              Collections
            </h3>
            {collection ? (
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Payment status</dt>
                  <dd>{collection.paymentStatus || "Pending"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Total paid</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCurrency(collection.totalPaid)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Next action</dt>
                  <dd>{collection.nextAction || queueItem?.nextAction || "Record payment"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-slate-500">No open collection record for this lab.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 p-2.5">
            <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <CalendarClock className="h-3 w-3" />
              Recent visits
            </h3>
            {visits.length ? (
              <ul className="space-y-1.5">
                {visits.slice(0, 5).map((visit) => (
                  <li
                    key={visit.visitId || `${visit.visitDate}-${visit.visitType}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-[11px]"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{visit.visitType || "Visit"}</p>
                      <p className="text-slate-500">{formatWhen(visit.visitDate)}</p>
                    </div>
                    {Number(visit.soldValue) > 0 ? (
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(visit.soldValue)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No recent visits in workspace cache.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 p-2.5">
            <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <ShieldAlert className="h-3 w-3" />
              Qualification
            </h3>
            {qualLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading qualification…
              </div>
            ) : (
              <p className="text-xs text-slate-800">
                Stage: <span className="font-semibold">{qualificationStage}</span>
              </p>
            )}
            {collection?.collectionsNotes || lab?.creditReason ? (
              <p className="mt-2 text-[11px] text-slate-600">
                {collection?.collectionsNotes || lab?.creditReason}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">No notes on file.</p>
            )}
          </section>

          <section className="rounded-lg border border-dashed border-slate-200 p-2.5">
            <h3 className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <ClipboardList className="h-3 w-3" />
              Recent orders
            </h3>
            <p className="text-xs text-slate-500">
              Order history opens from Labs — use View Orders for full line items.
            </p>
          </section>

          {currentUser ? (
            <section className="rounded-lg border border-slate-200 p-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Visit & collection proof
              </h3>
              <EvidenceContextActions
                currentUser={currentUser}
                labId={labId}
                className="h-8 w-full text-xs"
              />
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs"
              onClick={() => onAction("start_visit", snapshot)}
            >
              Start Visit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => onAction("record_payment", snapshot)}
              disabled={!labId}
            >
              Record Payment
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => onAction("follow_up", snapshot)}
            >
              Add Follow-up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 text-xs"
              onClick={() => onAction("open_labs", snapshot)}
            >
              View Lab
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}