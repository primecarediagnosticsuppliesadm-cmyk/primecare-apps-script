import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
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

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "previous_month", label: "Previous month" },
  { id: "custom", label: "Custom" },
];

function followUpVariant(status) {
  if (status === "OVERDUE") return "danger";
  if (status === "DUE") return "warning";
  if (status === "FUTURE") return "info";
  return "neutral";
}

function activityLabel(activity) {
  if (activity === "PROSPECT_CREATED") return "Prospect created";
  if (activity === "VISIT") return "Visit";
  if (activity === "ORDER") return "Order";
  if (activity === "COLLECTION") return "Collection";
  return activity || "—";
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
    <div className="space-y-4" data-testid="my-business-page">
      <PageHeader
        title="My Business"
        subtitle={`${rangeLabel} · ${MY_BUSINESS_TIME_ZONE}`}
        icon={Briefcase}
        compact
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => load({ refresh: true })}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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

      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="my-business-period">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPreset(item.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
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
          <section data-testid="my-business-attention">
            <h2 className="mb-2 text-sm font-semibold">Needs my attention</h2>
            {model.attention.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                Nothing due right now.
              </p>
            ) : (
              <div className="space-y-2">
                {model.attention.map((group) => (
                  <div key={group.type} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{group.title}</p>
                      <StatusBadge
                        variant={group.type === "FOLLOW_UP_OVERDUE" ? "danger" : "warning"}
                      >
                        {group.count}
                      </StatusBadge>
                    </div>
                    <ul className="space-y-1">
                      {group.items.slice(0, 5).map((item) => (
                        <li
                          key={`${group.type}:${item.labId}`}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            className="truncate text-left font-medium underline-offset-2 hover:underline"
                            onClick={() => openLab(item.labId)}
                          >
                            {item.labName || item.labId}
                          </button>
                          <span className="flex shrink-0 gap-1">
                            {group.type === "COLLECTION_DUE" && canCollect ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => openCollection(item)}
                              >
                                <Wallet className="mr-1 h-3 w-3" />
                                Collect
                              </Button>
                            ) : canLogVisit ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => logVisit(item)}
                              >
                                <ClipboardList className="mr-1 h-3 w-3" />
                                Log visit
                              </Button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section data-testid="my-business-kpis">
            <KpiCardGrid columns={4} dense>
              <KpiCard title="Prospects added" value={model.kpis.prospectsAdded} subtitle="Sourced in period" />
              <KpiCard title="Visits logged" value={model.kpis.visitsLogged} subtitle="Period visits" />
              <KpiCard title="Requirements" value={model.kpis.requirements} subtitle="Visit outcome" />
              <KpiCard title="Quote opportunities" value={model.kpis.quoteOpportunities} subtitle="Visit outcome, not a quote" />
              <KpiCard title="Follow-ups due" value={model.kpis.followUpsDue} subtitle="As of today" />
              <KpiCard title="Orders from my labs" value={model.kpis.ordersFromMyLabs} subtitle="Canonical orders" />
              <KpiCard
                title="₹ ordered by my labs"
                value={model.kpiDisplay.rupeesOrdered}
                kpiRawValue={model.kpis.rupeesOrdered}
                subtitle="orders.total_amount"
              />
              <KpiCard
                title="₹ collected from my labs"
                value={model.kpiDisplay.rupeesCollected}
                kpiRawValue={model.kpis.rupeesCollected}
                subtitle="payments.amount_received"
              />
            </KpiCardGrid>
          </section>

          {model.ledgerTruncated ? (
            <p className="text-xs text-muted-foreground">
              Showing {model.ledgerCap} of {model.ledgerTotal} rows. Narrow the date range to see the rest.
            </p>
          ) : null}

          <section data-testid="my-business-ledger">
            <h2 className="mb-2 text-sm font-semibold">Activity</h2>
            {model.ledger.length === 0 ? (
              <EmptyState compact title="No activity in this period" />
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {model.ledger.map((row) => (
                    <article key={row.id} className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="text-left text-sm font-semibold"
                          onClick={() => openLab(row.labId)}
                        >
                          {row.labName || row.labId}
                        </button>
                        <span className="text-[10px] text-muted-foreground">{row.date}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {activityLabel(row.activity)}
                        {row.lifecycle ? ` · ${row.lifecycle}` : ""}
                        {row.commercialOutcome ? ` · ${row.commercialOutcome}` : ""}
                      </p>
                      {row.nextAction ? (
                        <p className="mt-1 text-xs">Next: {row.nextAction}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.followUpStatus && row.followUpStatus !== "NONE" ? (
                          <StatusBadge variant={followUpVariant(row.followUpStatus)}>
                            {row.followUpStatus}
                          </StatusBadge>
                        ) : null}
                        {row.activity === "VISIT" && canLogVisit ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => logVisit(row)}
                          >
                            Follow up
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-lg border md:block">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {[
                          "Date",
                          "Lab",
                          "Lifecycle",
                          "Activity",
                          "Outcome",
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
                          <td className="px-2 py-2">{row.lifecycle || "—"}</td>
                          <td className="px-2 py-2">{activityLabel(row.activity)}</td>
                          <td className="px-2 py-2">{row.commercialOutcome || "—"}</td>
                          <td className="max-w-[10rem] truncate px-2 py-2">{row.discovery || "—"}</td>
                          <td className="px-2 py-2">{row.qualification || "—"}</td>
                          <td className="max-w-[12rem] truncate px-2 py-2">{row.notes || "—"}</td>
                          <td className="max-w-[10rem] truncate px-2 py-2">{row.nextAction || "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{row.followUpDate || "—"}</td>
                          <td className="px-2 py-2">
                            {row.followUpStatus && row.followUpStatus !== "NONE" ? (
                              <StatusBadge variant={followUpVariant(row.followUpStatus)}>
                                {row.followUpStatus}
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
