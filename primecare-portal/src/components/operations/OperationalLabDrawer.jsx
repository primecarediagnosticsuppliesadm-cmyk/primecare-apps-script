import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { getLabQualificationRead } from "@/api/primecareSupabaseApi.js";
import { buildOperationalLabSnapshot } from "@/operations/operationsCommandCenterModel.js";
import { collectionRiskToVariant } from "@/utils/statusTokens.js";
import { cn } from "@/lib/utils";
import { X, Loader2, MapPin } from "lucide-react";
import EvidenceContextActions from "@/components/evidence/EvidenceContextActions.jsx";
import { formatLabsCurrency, formatLabsDate } from "@/operations/labsHqEngine.js";
import { labAssignedAgentId, resolveLabAgent } from "@/operations/labAgentResolver.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "collections", label: "Collections" },
  { id: "orders", label: "Orders" },
  { id: "visits", label: "Visits" },
  { id: "qualification", label: "Qualification" },
  { id: "agent", label: "Assigned Agent" },
];

function formatWhen(iso) {
  return formatLabsDate(iso) || null;
}

function Field({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.labId
 * @param {object} props.opsPayload
 * @param {(action: string, snapshot: object) => void} props.onAction
 * @param {object} [props.labRecord] HQ lab row for agent / contact fields
 * @param {object[]} [props.directoryUsers] Operations Center directory for agent name lookup
 */
export default function OperationalLabDrawer({
  open,
  onClose,
  labId,
  opsPayload,
  onAction,
  currentUser,
  labRecord = null,
  directoryUsers = [],
}) {
  const [qualification, setQualification] = useState(null);
  const [qualLoading, setQualLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const snapshot = useMemo(() => {
    if (!labId || !opsPayload) return null;
    const base = buildOperationalLabSnapshot(
      { ...opsPayload, riskLabs: opsPayload.riskLabs || [] },
      labId
    );
    return base;
  }, [labId, opsPayload]);

  useEffect(() => {
    if (open) setActiveTab("overview");
  }, [open, labId]);

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

  const riskLevel = snapshot?.risk?.level || snapshot?.riskLevel || "Low";
  const drivers = snapshot?.risk?.drivers || [];
  const assignedAgent = resolveLabAgent(labRecord, directoryUsers);
  const agentName =
    assignedAgent.agentName ||
    snapshot?.collection?.assignedAgent ||
    "";
  const agentId = assignedAgent.agentId || labAssignedAgentId(labRecord) || "";
  const qualStage =
    qualification?.pipeline_stage || qualification?.stage || labRecord?.stage || snapshot?.stage || "";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Review lab">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[min(100vw,540px)] flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.2)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {labRecord?.labName || snapshot?.labName || "Lab"}
            </p>
            <p className="text-[11px] text-slate-500">
              {labRecord?.area ? (
                <>
                  <MapPin className="mr-0.5 inline h-3 w-3" />
                  {labRecord.area}
                </>
              ) : (
                "HQ lab workspace"
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 border-b px-2 py-1.5">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!snapshot && !labRecord ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading lab data…
            </div>
          ) : null}

          {activeTab === "overview" ? (
            <div className="space-y-3">
              <section className="rounded-lg border bg-slate-50/80 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge variant={collectionRiskToVariant(riskLevel)} compact>
                    {riskLevel} risk
                  </StatusBadge>
                  {labRecord?.creditStatus ? (
                    <StatusBadge variant="neutral" compact>
                      Credit {labRecord.creditStatus}
                    </StatusBadge>
                  ) : null}
                  {labRecord?.status ? (
                    <StatusBadge variant="neutral" compact>
                      {labRecord.status}
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {formatLabsCurrency(snapshot?.outstanding ?? labRecord?.outstandingAmount)}
                  <span className="ml-1 text-xs font-normal text-slate-500">outstanding</span>
                </p>
                {Number(snapshot?.overdueDays ?? labRecord?.daysOverdue) > 0 ? (
                  <p className="text-[11px] text-amber-700">
                    Overdue {snapshot?.overdueDays ?? labRecord?.daysOverdue} days
                  </p>
                ) : null}
                {drivers.length ? (
                  <ul className="mt-2 list-inside list-disc text-[11px] text-slate-600">
                    {drivers.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <Field label="Revenue" value={formatLabsCurrency(labRecord?.revenue)} />
                <Field label="Credit limit" value={formatLabsCurrency(labRecord?.creditLimit)} />
                <Field label="Stage" value={labRecord?.stage} />
                <Field label="Last visit" value={formatWhen(labRecord?.lastVisit)} />
                <Field label="Next follow-up" value={formatWhen(labRecord?.nextFollowUp)} />
              </dl>
            </div>
          ) : null}

          {activeTab === "collections" ? (
            <div className="space-y-3">
              <section className="rounded-lg border p-3">
                <p className="text-lg font-semibold tabular-nums">
                  {formatLabsCurrency(snapshot?.outstanding ?? labRecord?.outstandingAmount)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <Field label="Payment status" value={snapshot?.paymentStatus !== "—" ? snapshot?.paymentStatus : null} />
                  <Field label="Total paid" value={formatLabsCurrency(snapshot?.collection?.totalPaid)} />
                  <Field
                    label="Last follow-up"
                    value={formatWhen(snapshot?.collection?.lastFollowUp)}
                  />
                  <Field label="Days overdue" value={snapshot?.overdueDays ? String(snapshot.overdueDays) : null} />
                </dl>
                {snapshot?.collection?.collectionsNotes ? (
                  <p className="mt-3 text-xs text-slate-600">{snapshot.collection.collectionsNotes}</p>
                ) : null}
              </section>
              {currentUser ? (
                <EvidenceContextActions
                  currentUser={currentUser}
                  labId={labId}
                  className="h-8 w-full text-xs"
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => onAction("collections", snapshot)}
              >
                Open Collections
              </Button>
            </div>
          ) : null}

          {activeTab === "orders" ? (
            <section className="rounded-lg border p-3">
              {snapshot?.orders?.length ? (
                <ul className="space-y-1.5">
                  {snapshot.orders.map((o) => (
                    <li key={o.orderId}>
                      <button
                        type="button"
                        className="flex w-full justify-between gap-2 rounded border border-slate-100 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                        onClick={() =>
                          onAction("orderReview", { ...(snapshot || {}), orderId: o.orderId })
                        }
                      >
                        <span className="font-medium text-indigo-700">{o.orderId}</span>
                        <span className="text-slate-600">
                          {o.orderStatus} · {formatLabsCurrency(o.orderTotal)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No orders loaded for this lab.</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => onAction("orders", snapshot)}
              >
                Open Orders
              </Button>
            </section>
          ) : null}

          {activeTab === "visits" ? (
            <section className="rounded-lg border p-3">
              {snapshot?.visits?.length ? (
                <ul className="space-y-1.5">
                  {snapshot.visits.map((v) => (
                    <li key={v.visitId || v.id} className="rounded border border-slate-100 px-2 py-1.5 text-xs">
                      <span className="font-medium">{formatWhen(v.visitDate || v.date)}</span>
                      <span className="text-slate-600">
                        {" "}
                        · {v.visitType} · {v.agent || v.agentName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No recent visits on record.</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => onAction("visits", snapshot)}
              >
                Open Visits
              </Button>
            </section>
          ) : null}

          {activeTab === "qualification" ? (
            <section className="rounded-lg border p-3">
              {qualLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <>
                  <p className="text-sm">
                    Stage: <span className="font-semibold">{qualStage || "Not recorded"}</span>
                  </p>
                  {qualification?.status ? (
                    <p className="mt-2 text-xs text-slate-600">Status: {qualification.status}</p>
                  ) : null}
                  {qualification?.notes ? (
                    <p className="mt-2 text-xs text-slate-600">{qualification.notes}</p>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {activeTab === "agent" ? (
            <section className="rounded-lg border p-3">
              {agentName || agentId ? (
                <dl className="space-y-2 text-xs">
                  <Field label="Agent name" value={agentName} />
                  <Field label="Agent ID" value={agentId} />
                </dl>
              ) : (
                <p className="text-xs text-amber-700">No field agent assigned to this lab.</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => onAction("operationsCenter", snapshot)}
              >
                Manage in Operations Center
              </Button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
