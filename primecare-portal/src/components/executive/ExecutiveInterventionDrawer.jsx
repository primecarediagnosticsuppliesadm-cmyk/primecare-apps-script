import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { buildOperationalLabSnapshot } from "@/operations/operationsCommandCenterModel.js";
import { getLabQualificationRead } from "@/api/primecareSupabaseApi.js";
import VisitEvidenceChips from "@/components/evidence/VisitEvidenceChips.jsx";
import { collectionRiskToVariant } from "@/utils/statusTokens.js";
import { cn } from "@/lib/utils";
import { X, Loader2, Clock3, User, Wallet, FileCheck } from "lucide-react";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatWhen(iso) {
  if (!iso) return "Recently";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "timeline", label: "Timeline" },
  { key: "collections", label: "Collections" },
  { key: "evidence", label: "Evidence" },
];

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ type: string, labId?: string, agentName?: string, feedItem?: object, title?: string }} props.context
 * @param {object} props.opsPayload
 * @param {object|null} props.currentUser
 * @param {(page: string) => void} [props.onNavigate]
 * @param {(action: string, snapshot?: object) => void} [props.onLabAction]
 */
export default function ExecutiveInterventionDrawer({
  open,
  onClose,
  context,
  opsPayload,
  currentUser,
  onNavigate,
  onLabAction,
}) {
  const [tab, setTab] = useState("summary");
  const [qualification, setQualification] = useState(null);
  const [qualLoading, setQualLoading] = useState(false);

  const labId = context?.type === "lab" || context?.labId ? context.labId : context?.feedItem?.labId;
  const agentName = context?.agentName || context?.feedItem?.agentName;

  const labSnapshot = useMemo(() => {
    if (!labId || !opsPayload) return null;
    return buildOperationalLabSnapshot(opsPayload, labId);
  }, [labId, opsPayload]);

  const agentVisits = useMemo(() => {
    if (!agentName || !opsPayload?.visits) return [];
    return opsPayload.visits
      .filter((v) => String(v.agent || v.agentName) === String(agentName))
      .slice(0, 12);
  }, [agentName, opsPayload?.visits]);

  const timelineEvents = useMemo(() => {
    const events = [];
    if (labSnapshot?.visits?.length) {
      for (const v of labSnapshot.visits) {
        events.push({
          id: `v-${v.visitId || v.id}`,
          at: v.visitDate || v.date,
          label: `Visit · ${v.visitType || "Field"}`,
          detail: v.agent || v.agentName || "",
        });
      }
    }
    if (labSnapshot?.orders?.length) {
      for (const o of labSnapshot.orders) {
        events.push({
          id: `o-${o.orderId}`,
          at: o.orderDate || o.createdAt,
          label: `Order · ${o.orderStatus}`,
          detail: formatCurrency(o.orderTotal),
        });
      }
    }
    return events.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
  }, [labSnapshot]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTab("summary");
      return;
    }
    if (context?.type === "agent") setTab("timeline");
    else setTab("summary");
  }, [open, context?.type]);

  useEffect(() => {
    if (!open || !labId) {
      setQualification(null);
      return;
    }
    let cancelled = false;
    void (async () => {
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

  const title =
    context?.title ||
    (agentName ? `Agent · ${agentName}` : labSnapshot?.labName || "Executive detail");

  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[92vh] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="text-[10px] text-slate-500">Executive intervention detail</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {labId ? (
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-[10px] font-medium",
                    tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  )}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {context?.type === "agent" ? (
            <section className="space-y-3">
              <div className="rounded-lg border bg-slate-50 p-2.5">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <p className="text-sm font-semibold">{agentName}</p>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  {agentVisits.length} recent visits in loaded window
                </p>
              </div>
              <ul className="space-y-1">
                {agentVisits.map((v) => (
                  <li
                    key={v.visitId || v.id}
                    className="rounded-md border px-2 py-1.5 text-[11px]"
                  >
                    <p className="font-medium">{v.labName || v.labId}</p>
                    <p className="text-slate-500">
                      {formatWhen(v.visitDate || v.date)} · {v.visitType}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {labSnapshot && tab === "summary" ? (
            <section className="space-y-3">
              <div className="rounded-lg border bg-slate-50/80 p-2.5">
                <StatusBadge
                  variant={collectionRiskToVariant(labSnapshot.risk?.level || labSnapshot.riskLevel)}
                  compact
                >
                  {labSnapshot.risk?.level || labSnapshot.riskLevel || "Risk"}
                </StatusBadge>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {formatCurrency(labSnapshot.outstanding)}
                  <span className="ml-1 text-xs font-normal text-slate-500">outstanding</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  Overdue {labSnapshot.overdueDays ?? 0}d · {labSnapshot.paymentStatus}
                </p>
              </div>
              {qualLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <p className="text-[11px] text-slate-600">
                  Qualification:{" "}
                  <span className="font-semibold">
                    {qualification?.qualification_band ||
                      qualification?.qualificationBand ||
                      "Pending"}
                  </span>
                  {" · "}
                  Review: {qualification?.founder_review_status || qualification?.founderReviewStatus || "—"}
                </p>
              )}
            </section>
          ) : null}

          {labSnapshot && tab === "timeline" ? (
            <ul className="space-y-1">
              {timelineEvents.length ? (
                timelineEvents.map((e) => (
                  <li key={e.id} className="flex gap-2 rounded-md border px-2 py-1.5 text-[11px]">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium">{e.label}</p>
                      <p className="text-slate-500">
                        {formatWhen(e.at)} · {e.detail}
                      </p>
                    </div>
                  </li>
                ))
              ) : (
                <p className="text-xs text-slate-500">No timeline events for this lab.</p>
              )}
            </ul>
          ) : null}

          {labSnapshot && tab === "collections" ? (
            <section className="rounded-lg border p-2.5 text-[11px]">
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-slate-500">Outstanding</dt>
                  <dd className="font-semibold">{formatCurrency(labSnapshot.outstanding)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Total paid</dt>
                  <dd>{formatCurrency(labSnapshot.collection?.totalPaid)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Next follow-up</dt>
                  <dd>{formatWhen(labSnapshot.collection?.nextFollowUp)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Agent</dt>
                  <dd>{labSnapshot.collection?.agent || labSnapshot.collection?.assignedAgent || "—"}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {labSnapshot && tab === "evidence" && currentUser ? (
            <section className="space-y-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Field evidence</p>
              {(labSnapshot.visits || []).slice(0, 4).map((v) => (
                <div key={v.visitId || v.id} className="rounded-md border px-2 py-1.5">
                  <p className="text-[11px] font-medium">{formatWhen(v.visitDate || v.date)}</p>
                  <VisitEvidenceChips
                    currentUser={currentUser}
                    visitId={v.visitId || v.id}
                    labId={labId}
                    allEvidence={opsPayload?.evidence || []}
                  />
                </div>
              ))}
            </section>
          ) : null}

          {context?.feedItem ? (
            <section className="rounded-lg border p-2.5 text-[11px]">
              <p className="font-semibold">{context.feedItem.eventType || context.feedItem.title}</p>
              <p className="mt-1 text-slate-600">{context.feedItem.subtitle}</p>
              <p className="mt-1 text-slate-500">{formatWhen(context.feedItem.createdAt)}</p>
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t bg-white px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {labId ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-[10px]"
                  onClick={() => onLabAction?.("collections", labSnapshot)}
                >
                  <Wallet className="mr-1 h-3 w-3" />
                  Collections
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px]"
                  onClick={() => onNavigate?.("visits")}
                >
                  Visits
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px]"
                  onClick={() => onNavigate?.("qualificationReview")}
                >
                  <FileCheck className="mr-1 h-3 w-3" />
                  Qualification
                </Button>
              </>
            ) : null}
            {context?.feedItem?.labId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[10px]"
                onClick={() => {
                  onClose();
                  onLabAction?.("lab", { labId: context.feedItem.labId });
                }}
              >
                View Lab
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
