import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Building2,
  ClipboardList,
  Phone,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  DataFetchError,
  EmptyState,
  KpiCard,
  KpiCardGrid,
  PageHeader,
  PageSkeleton,
  StatusBadge,
} from "@/components/ux";
import { ROLES } from "@/config/roles";
import { getMyBusinessRead } from "@/myBusiness/myBusinessRead.js";
import {
  formatMyBusinessRangeLabel,
  MY_BUSINESS_TIME_ZONE,
  resolveMyBusinessRange,
} from "@/myBusiness/myBusinessCalendar.js";
import {
  startCollectionFromWorkspaceItem,
  startVisitFromWorkspaceItem,
} from "@/pages/agentVisitContext.js";
import {
  attentionContextLabels,
  attentionHasCollection,
  attentionHasVisitWork,
  activityDayLabel,
  attentionPrimaryLabel,
  displayVisitNotes,
  formatMyBusinessDisplayLabel,
} from "@/myBusiness/myBusinessDisplay.js";
import { resolveVisitHandoffWrite } from "@/visits/visitHandoffsApi.js";
import { commercialTermLines } from "@/visits/commercialResponse.js";
import { LOSS_REASON_OPTIONS } from "@/visits/visitHandoffsContract.js";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "previous_month", label: "Previous month" },
  { id: "custom", label: "Custom" },
];

function groupActivity(rows, todayYmd) {
  const groups = [];
  for (const row of rows || []) {
    const label = activityDayLabel(row.date, todayYmd) || row.date || "Activity";
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, rows: [row] });
    else last.rows.push(row);
  }
  return groups;
}

function activitySentence(row) {
  const verb = {
    VISIT: "Visited",
    PROSPECT_CREATED: "Added prospect",
    ORDER: "Order placed",
    COLLECTION: "Collected",
  }[row.activity] || formatMyBusinessDisplayLabel(row.activity);
  const lab = row.labName || row.labId || "lab";
  const outcome = row.commercialOutcome ? formatMyBusinessDisplayLabel(row.commercialOutcome) : "";
  return outcome ? `${verb} ${lab} · ${outcome}` : `${verb} ${lab}`;
}

function followUpVariant(status) {
  if (status === "OVERDUE") return "danger";
  if (status === "DUE") return "warning";
  if (status === "FUTURE") return "info";
  return "neutral";
}

function NotesText({ notes }) {
  const visible = displayVisitNotes(notes);
  if (!visible) return "—";
  return (
    <span className="block max-w-[12rem] truncate" title={visible}>
      {visible}
    </span>
  );
}

export default function MyBusinessPage({ currentUser = null, setActivePage = null }) {
  const role = String(currentUser?.role || "").toLowerCase();
  const isHq = role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
  const canLogVisit = role === ROLES.AGENT;
  const canCollect = role === ROLES.AGENT || role === ROLES.ADMIN;
  const [preset, setPreset] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const rangeInput = useMemo(() => {
    if (preset === "custom") return { preset, from: customFrom, to: customTo };
    return { preset };
  }, [preset, customFrom, customTo]);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        const result = await getMyBusinessRead({
          actor: currentUser,
          requestedSubjectAgentId: isHq ? selectedAgentId : "",
          rangeInput,
        });
        if (!result.success) {
          setPayload(result.data || null);
          setError(result.error || "Could not load My Business");
          return;
        }
        setPayload(result.data);
        if (isHq && !selectedAgentId && result.data?.agentDirectory?.length === 1) {
          setSelectedAgentId(result.data.agentDirectory[0].agentId);
        }
      } catch (err) {
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser, isHq, rangeInput, selectedAgentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const model = payload?.model;
  const directory = payload?.agentDirectory || [];
  const rangeLabel = formatMyBusinessRangeLabel(
    model?.range || resolveMyBusinessRange(rangeInput)
  );

  const openLab = (labId) => {
    if (!labId || !setActivePage) return;
    setActivePage("labs", { labId });
  };

  const openVisitWorkspace = () => {
    setActivePage?.("visits");
  };

  const logVisit = (item) => {
    startVisitFromWorkspaceItem(
      {
        labId: item.labId,
        labName: item.labName,
        nextAction: item.nextAction,
        dueDate: item.followUpDate || item.dueDate,
      },
      { source: "my_business", returnPath: "myBusiness" }
    );
    setActivePage?.("visits");
  };

  const openCollection = (item) => {
    startCollectionFromWorkspaceItem(item, { returnPath: "myBusiness" });
    setActivePage?.("collections");
  };

  if (loading && !model) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" data-testid="my-business-page">
      <PageHeader
        title="My Business"
        subtitle={rangeLabel}
        compact
        className="flex-col sm:flex-row"
        actions={
          <div className="flex flex-wrap gap-2">
          {canLogVisit ? (
            <Button
              type="button"
              size="sm"
              className="min-h-10"
              onClick={openVisitWorkspace}
              data-testid="my-business-log-visit"
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5" />
              Log visit
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10"
            onClick={() => {
              if (isHq && selectedAgentId) {
                window.sessionStorage.setItem("primecare.reviewSubject", selectedAgentId);
              }
              setActivePage?.("agentReviews");
            }}
            data-testid="open-reviews-development"
          >
            Reviews & Development
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10"
            onClick={() => load({ refresh: true })}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          </div>
        }
      />

      {isHq ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Agent
            <select
              className="mt-1 block min-w-[12rem] rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              data-testid="my-business-agent-picker"
            >
              <option value="">Select an Agent</option>
              {directory.map((row) => (
                <option key={row.agentId} value={row.agentId}>
                  {row.agentName} ({row.agentId})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2" data-testid="my-business-period">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPreset(item.id)}
            className={`min-h-10 whitespace-nowrap rounded-full px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              preset === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-border px-2 py-1 text-sm"
            aria-label="From date"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-border px-2 py-1 text-sm"
            aria-label="To date"
          />
        </div>
      ) : null}

      {error === "agent_required" && isHq ? (
        <EmptyState
          compact
          title="Select an Agent"
          description="Founder and Admin see the same My Business model as the Agent."
        />
      ) : error && error !== "agent_required" ? (
        <DataFetchError message={error} onRetry={() => load({ refresh: true })} />
      ) : null}

      {model && !error ? (
        <>
          <section aria-labelledby="my-business-your-business" data-testid="my-business-primary">
            <h2 id="my-business-your-business" className="mb-2 text-sm font-semibold">
              Your business
            </h2>
            <KpiCardGrid columns={4} dense>
              <KpiCard
                title="Prospects added"
                value={model.kpis.prospectsAdded}
                subtitle="Sourced in period"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Visits logged"
                value={model.kpis.visitsLogged}
                subtitle="In this period"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Orders"
                value={model.kpis.ordersFromMyLabs}
                subtitle="Orders placed"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Sales"
                value={model.kpiDisplay.rupeesOrdered}
                kpiRawValue={model.kpis.rupeesOrdered}
                subtitle="Total sales"
                className="shadow-none hover:shadow-none"
              />
            </KpiCardGrid>
          </section>

          <section aria-labelledby="my-business-your-actions" data-testid="my-business-actions" className="space-y-3">
            <div>
              <h2 id="my-business-your-actions" className="text-sm font-semibold">
                Your actions
              </h2>
              <p className="text-[11px] text-muted-foreground" data-testid="my-business-attention-as-of">
                As of today
              </p>
            </div>

            {(model.primecareResponded || []).length ? (
              <section data-ae1c-primecare-responded="true" className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-950">PrimeCare Responded — Your Action</h3>
                {model.primecareResponded.map((item) => (
                  <PrimeCareRespondedCard
                    key={item.id}
                    item={item}
                    canAct={canLogVisit}
                    onOpenLab={openLab}
                    onConverted={(labStatus, labId) => {
                      if (labStatus === "PROSPECT") {
                        openLab(labId);
                        return;
                      }
                      setActivePage?.("orders");
                    }}
                    onResolved={() => load({ refresh: true })}
                  />
                ))}
              </section>
            ) : null}

            <section data-testid="my-business-attention">
              {model.attention.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  Nothing due right now.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {model.attention.map((item) => {
                    const context = attentionContextLabels(item);
                    const showCollect = attentionHasCollection(item) && canCollect;
                    const showVisit = attentionHasVisitWork(item) && canLogVisit;
                    return (
                      <article
                        key={item.labId}
                        data-testid="my-business-attention-item"
                        data-lab-id={item.labId}
                        className="rounded-md border border-border bg-card px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 truncate text-left text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                            onClick={() => openLab(item.labId)}
                          >
                            {item.labName || item.labId}
                          </button>
                          <StatusBadge
                            variant={item.primaryType === "FOLLOW_UP_OVERDUE" ? "danger" : "warning"}
                          >
                            {attentionPrimaryLabel(item.primaryType)}
                          </StatusBadge>
                        </div>
                        {context.length ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{context.join(" · ")}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 text-sm">
                            Next: {item.nextAction || "—"}
                          </p>
                          <div className="flex shrink-0 flex-wrap gap-1">
                            {showCollect ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-10 px-3"
                                onClick={() => openCollection(item)}
                              >
                                <Wallet className="mr-1 h-3.5 w-3.5" />
                                Collect
                              </Button>
                            ) : null}
                            {showVisit ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-10 px-3"
                                onClick={() => logVisit(item)}
                              >
                                <ClipboardList className="mr-1 h-3.5 w-3.5" />
                                Log visit
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {(model.waitingOnPrimecare || []).length ? (
              <section data-ae1c-waiting-on-primecare="true" className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">Waiting on PrimeCare</h3>
                {model.waitingOnPrimecare.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2"
                    data-ae1c-waiting-item={item.id}
                  >
                    <p className="text-sm font-semibold">{item.labName || item.labId}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.requirementSummary}</p>
                    <p className="mt-0.5 text-xs font-medium text-indigo-900">Waiting on PrimeCare</p>
                  </article>
                ))}
              </section>
            ) : null}
          </section>

          <section data-testid="my-business-kpis" aria-labelledby="my-business-also">
            <h2 id="my-business-also" className="mb-2 text-sm font-semibold">
              Also this period
            </h2>
            <KpiCardGrid columns={4} dense>
              <KpiCard
                title="Requirements"
                value={model.kpis.requirements}
                subtitle="Noted on a visit"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Quote opportunities"
                value={model.kpis.quoteOpportunities}
                subtitle="Noted on a visit"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Follow-ups due"
                value={model.kpis.followUpsDue}
                subtitle="As of today"
                className="shadow-none hover:shadow-none"
              />
              <KpiCard
                title="Collected"
                value={model.kpiDisplay.rupeesCollected}
                kpiRawValue={model.kpis.rupeesCollected}
                subtitle="From my labs"
                className="shadow-none hover:shadow-none"
              />
            </KpiCardGrid>
          </section>

          {model.ledgerTruncated ? (
            <p className="text-xs text-muted-foreground">
              Showing {model.ledgerCap} of {model.ledgerTotal} rows. Narrow the date range to see the rest.
            </p>
          ) : null}

          <section data-testid="my-business-ledger" aria-labelledby="my-business-activity">
            <h2 id="my-business-activity" className="mb-2 text-sm font-semibold">
              Recent activity
            </h2>
            {model.ledger.length === 0 ? (
              <p
                className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
                data-testid="my-business-ledger-empty"
              >
                No activity recorded for this period.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {groupActivity(model.ledger, model.range?.todayYmd).map((group) => (
                    <div key={group.label}>
                      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{group.label}</h3>
                      <ul className="space-y-1.5">
                        {group.rows.map((row) => (
                          <li key={row.id}>
                    <article className="rounded-md border border-border bg-card px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="text-left text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                          onClick={() => openLab(row.labId)}
                        >
                          {activitySentence(row)}
                        </button>
                        <span className="sr-only md:hidden">{row.date}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMyBusinessDisplayLabel(row.lifecycle) || "Lab"}
                      </p>
                      {displayVisitNotes(row.notes) ? (
                        <p className="mt-1 truncate text-xs" title={displayVisitNotes(row.notes)}>
                          {displayVisitNotes(row.notes)}
                        </p>
                      ) : null}
                      {row.nextAction ? (
                        <p className="mt-1 text-xs">Next: {row.nextAction}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.followUpStatus && row.followUpStatus !== "NONE" ? (
                          <StatusBadge variant={followUpVariant(row.followUpStatus)}>
                            {formatMyBusinessDisplayLabel(row.followUpStatus)}
                          </StatusBadge>
                        ) : null}
                        {row.activity === "VISIT" && canLogVisit ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-10 px-3"
                            onClick={() => logVisit(row)}
                          >
                            Follow up
                          </Button>
                        ) : null}
                      </div>
                    </article>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <details className="mt-3 hidden md:block">
                  <summary className="cursor-pointer text-sm font-medium">Full activity table</summary>
                <div className="mt-2 hidden overflow-x-auto rounded-lg border md:block">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {[
                          "Date",
                          "Lab",
                          "Lab status",
                          "Activity",
                          "Visit result",
                          "Discovery",
                          "Qualification",
                          "Notes",
                          "Next action",
                          "Follow-up",
                          "Status",
                          "Order",
                          "Collection",
                        ].map((h) => (
                          <th key={h} className="px-2 py-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {model.ledger.map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="px-2 py-2 whitespace-nowrap">{row.date}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className="font-medium hover:underline"
                              onClick={() => openLab(row.labId)}
                            >
                              {row.labName || row.labId}
                            </button>
                          </td>
                          <td className="px-2 py-2">{formatMyBusinessDisplayLabel(row.lifecycle) || "—"}</td>
                          <td className="px-2 py-2">{formatMyBusinessDisplayLabel(row.activity)}</td>
                          <td className="px-2 py-2">
                            {row.commercialOutcome
                              ? formatMyBusinessDisplayLabel(row.commercialOutcome)
                              : "—"}
                          </td>
                          <td className="max-w-[10rem] truncate px-2 py-2">{row.discovery || "—"}</td>
                          <td className="px-2 py-2">
                            {row.qualification ? formatMyBusinessDisplayLabel(row.qualification) : "—"}
                          </td>
                          <td className="px-2 py-2">
                            <NotesText notes={row.notes} />
                          </td>
                          <td className="max-w-[10rem] truncate px-2 py-2">{row.nextAction || "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{row.followUpDate || "—"}</td>
                          <td className="px-2 py-2">
                            {row.followUpStatus && row.followUpStatus !== "NONE" ? (
                              <StatusBadge variant={followUpVariant(row.followUpStatus)}>
                                {formatMyBusinessDisplayLabel(row.followUpStatus)}
                              </StatusBadge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {row.orderAmount == null ? "—" : `₹${row.orderAmount.toLocaleString("en-IN")}`}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {row.collectionAmount == null
                              ? "—"
                              : `₹${row.collectionAmount.toLocaleString("en-IN")}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              </>
            )}
          </section>
        </>
      ) : null}

      <p className="hidden text-[10px] text-muted-foreground" data-timezone={MY_BUSINESS_TIME_ZONE}>
        {MY_BUSINESS_TIME_ZONE}
      </p>
      <span className="hidden" data-testid="my-business-icons">
        <Building2 className="h-3 w-3" />
        <Phone className="h-3 w-3" />
      </span>
    </div>
  );
}

function CommercialTerms({ terms }) {
  const lines = commercialTermLines(terms);
  return (
    <dl className="mt-2 space-y-1.5 text-xs" data-commercial-terms={terms.decision}>
      {lines.map((line) =>
        line.label === "Pack" ? (
          <p key={`${line.label}:${line.value}`} className="text-muted-foreground">
            Pack: {line.value}
          </p>
        ) : line.label ? (
          <div key={`${line.label}:${line.value}`}>
            <dt className="text-[10px] font-semibold tracking-wide text-amber-950/70">{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ) : (
          <p key={line.value}>{line.value}</p>
        )
      )}
    </dl>
  );
}

function PrimeCareRespondedCard({ item, canAct, onOpenLab, onConverted, onResolved }) {
  const [mode, setMode] = useState("");
  const [followDate, setFollowDate] = useState(item.followUpDate || "");
  const [nextAction, setNextAction] = useState(item.nextAction || "");
  const [lossReason, setLossReason] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prospect = String(item.labStatus || "").toUpperCase() === "PROSPECT";

  async function run(action, extra = {}) {
    setBusy(true);
    setError("");
    const res = await resolveVisitHandoffWrite({
      handoffId: item.id,
      action,
      ...extra,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Could not save.");
      return;
    }
    setMode("");
    onResolved?.();
  }

  return (
    <article
      className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5"
      data-ae1c-responded-item={item.id}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 text-left text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          onClick={() => onOpenLab(item.labId)}
        >
          {item.labName || item.labId}
        </button>
      </div>
      <p className="mt-1 text-xs">
        <span className="text-muted-foreground">Asked: </span>
        {item.requirementSummary}
      </p>
      {item.commercialTerms ? (
        <CommercialTerms terms={item.commercialTerms} />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-xs">
          <span className="text-muted-foreground">PrimeCare: </span>
          {item.hqResponse}
        </p>
      )}
      {item.nextAction || item.followUpDate ? (
        <p className="mt-1 text-xs">
          Next: {item.nextAction || "—"}
          {item.followUpDate ? ` · ${item.followUpDate}` : ""}
        </p>
      ) : null}

      {canAct ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setMode("follow")}>
            Followed up — still deciding
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setMode("converted")}>
            Converted to order
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setMode("loss")}>
            Not proceeding
          </Button>
        </div>
      ) : null}

      {mode === "follow" ? (
        <div className="mt-2 space-y-2 rounded-md border bg-white p-2">
          <label className="block text-[11px] font-medium">
            Next follow-up date
            <input
              type="date"
              className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
              value={followDate}
              onChange={(e) => setFollowDate(e.target.value)}
            />
          </label>
          <label className="block text-[11px] font-medium">
            Next action
            <input
              className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={busy || !followDate}
            onClick={() =>
              run("FOLLOWED_UP", { nextFollowUpDate: followDate, nextAction })
            }
          >
            Save follow-up
          </Button>
        </div>
      ) : null}

      {mode === "converted" ? (
        <div className="mt-2 space-y-2 rounded-md border bg-white p-2" data-ae1c-converted-next="true">
          {prospect ? (
            <p className="text-xs">
              This lab is still a Prospect. Activate the Prospect, then use the existing Orders workflow. This
              does not create an order.
            </p>
          ) : (
            <p className="text-xs">Mark converted, then continue in the existing Orders workflow. No order is created here.</p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              await run("CONVERTED");
              onConverted?.(item.labStatus, item.labId);
            }}
          >
            {prospect ? "Mark converted and open activation" : "Mark converted and open Orders"}
          </Button>
        </div>
      ) : null}

      {mode === "loss" ? (
        <div className="mt-2 space-y-2 rounded-md border bg-white p-2">
          <label className="block text-[11px] font-medium">
            Why not proceeding
            <select
              className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              data-ae1c-loss-reason="true"
            >
              <option value="">Select a reason</option>
              {LOSS_REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {lossReason === "OTHER" ? (
            <label className="block text-[11px] font-medium">
              Explain
              <input
                className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
              />
            </label>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || !lossReason || (lossReason === "OTHER" && !String(closeNote).trim())}
            onClick={() => run("NOT_PROCEEDING", { lossReason, closeNote })}
          >
            Close as not proceeding
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
