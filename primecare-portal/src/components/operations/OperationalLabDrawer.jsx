import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { getLabQualificationRead } from "@/api/primecareSupabaseApi.js";
import { buildOperationalLabSnapshot } from "@/operations/operationsCommandCenterModel.js";
import { collectionRiskToVariant } from "@/utils/statusTokens.js";
import { cn } from "@/lib/utils";
import { X, Loader2, IndianRupee, MapPin } from "lucide-react";
import EvidenceContextActions from "@/components/evidence/EvidenceContextActions.jsx";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatWhen(iso) {
  if (!iso || iso === "—") return "—";
  const d = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.labId
 * @param {object} props.opsPayload
 * @param {(action: string, snapshot: object) => void} props.onAction
 */
export default function OperationalLabDrawer({
  open,
  onClose,
  labId,
  opsPayload,
  onAction,
  currentUser,
}) {
  const [qualification, setQualification] = useState(null);
  const [qualLoading, setQualLoading] = useState(false);

  const snapshot = useMemo(() => {
    if (!labId || !opsPayload) return null;
    const base = buildOperationalLabSnapshot(
      { ...opsPayload, riskLabs: opsPayload.riskLabs || [] },
      labId
    );
    return base;
  }, [labId, opsPayload]);

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

  const riskLevel = snapshot?.risk?.level || snapshot?.riskLevel || "—";
  const drivers = snapshot?.risk?.drivers || [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Lab operations">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[min(100vw,520px)] flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.2)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{snapshot?.labName || "Lab"}</p>
            <p className="text-[11px] text-slate-500">
              {snapshot?.area ? (
                <>
                  <MapPin className="mr-0.5 inline h-3 w-3" />
                  {snapshot.area}
                </>
              ) : (
                "Operational snapshot"
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <section className="rounded-lg border bg-slate-50/80 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge variant={collectionRiskToVariant(riskLevel)} compact>
                {riskLevel} risk
              </StatusBadge>
              <StatusBadge variant="neutral" compact>
                {snapshot?.paymentStatus || "—"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-lg font-semibold tabular-nums">
              {formatCurrency(snapshot?.outstanding)}
              <span className="ml-1 text-xs font-normal text-slate-500">outstanding</span>
            </p>
            <p className="text-[11px] text-slate-600">
              Overdue {snapshot?.overdueDays ?? 0} days
            </p>
            {drivers.length ? (
              <ul className="mt-2 list-inside list-disc text-[11px] text-slate-600">
                {drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-lg border p-2.5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Recent orders
            </h3>
            {snapshot?.orders?.length ? (
              <ul className="space-y-1">
                {snapshot.orders.map((o) => (
                  <li
                    key={o.orderId}
                    className="flex justify-between gap-2 rounded border border-slate-100 px-2 py-1 text-[11px]"
                  >
                    <span className="font-medium">{o.orderId}</span>
                    <span>
                      {o.orderStatus} · {formatCurrency(o.orderTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No orders in current load.</p>
            )}
          </section>

          <section className="rounded-lg border p-2.5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Collections & visits
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <dt className="text-slate-500">Total paid</dt>
                <dd>{formatCurrency(snapshot?.collection?.totalPaid)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last follow-up</dt>
                <dd>{formatWhen(snapshot?.collection?.lastFollowUp)}</dd>
              </div>
            </dl>
            {snapshot?.visits?.length ? (
              <ul className="mt-2 space-y-1">
                {snapshot.visits.map((v) => (
                  <li key={v.visitId || v.id} className="text-[11px] text-slate-700">
                    {formatWhen(v.visitDate || v.date)} · {v.visitType} · {v.agent || v.agentName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No recent visits cached.</p>
            )}
          </section>

          {currentUser ? (
            <section className="rounded-lg border border-dashed border-slate-200 p-2.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Field evidence
              </h3>
              <EvidenceContextActions
                currentUser={currentUser}
                labId={labId}
                className="h-8 w-full text-xs"
              />
            </section>
          ) : null}

          <section className="rounded-lg border p-2.5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Qualification
            </h3>
            {qualLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <p className="text-xs">
                Stage:{" "}
                <span className="font-semibold">
                  {qualification?.pipeline_stage ||
                    qualification?.stage ||
                    snapshot?.stage ||
                    "—"}
                </span>
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-600">
              {snapshot?.collection?.collectionsNotes || "No operational notes on file."}
            </p>
          </section>
        </div>

        <div className="shrink-0 border-t px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs"
              disabled={!snapshot}
              onClick={() => onAction("orders", snapshot)}
            >
              Open Orders
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              disabled={!snapshot}
              onClick={() => onAction("collections", snapshot)}
            >
              Collections
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              disabled={!snapshot}
              onClick={() => onAction("visits", snapshot)}
            >
              Visit History
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 text-xs"
              disabled={!snapshot}
              onClick={() => onAction("labs", snapshot)}
            >
              Review Lab
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}