import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { resolveLabAgent } from "@/operations/labAgentResolver.js";
import {
  buildCreditRiskAttentionCards,
  buildCreditRiskPortfolioStrip,
  buildInterventionLabs,
  buildTopExposureLabs,
  filterCollectionsForCreditRiskView,
  formatCreditRiskCurrency,
  groupCollectionsByOverdueBucket,
  OVERDUE_BUCKET_LABELS,
  OVERDUE_BUCKET_ORDER,
} from "@/operations/creditRiskHqEngine.js";
import { formatLastPaymentAge } from "@/collections/collectionsCockpitMetrics.js";
import {
  navigateToCollections,
  navigateToLabs,
  navigateToOperationsCenter,
  navigateToOrders,
  navigateToVisits,
} from "@/operations/hqWorkflowNav.js";
import { labIdKey } from "@/utils/labId.js";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  IndianRupee,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";

const ATTENTION_ICONS = {
  collections: Wallet,
  hold: ShieldAlert,
  overdue: AlertTriangle,
  exposure: TrendingUp,
};

const SEVERITY_STYLES = {
  critical: "border-red-200 bg-red-50/80",
  attention: "border-amber-200 bg-amber-50/70",
  monitor: "border-blue-200 bg-blue-50/60",
  healthy: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_LABELS = {
  critical: "Critical",
  attention: "Needs action",
  monitor: "Monitor",
  healthy: "Clear",
};

const RISK_BADGE_STYLES = {
  Low: "bg-emerald-100 text-emerald-800",
  Medium: "bg-amber-100 text-amber-800",
  High: "bg-orange-100 text-orange-800",
  Critical: "bg-red-100 text-red-800",
};

function str(v) {
  return String(v ?? "").trim();
}

function RiskBadge({ level }) {
  const label = str(level) || "Low";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        RISK_BADGE_STYLES[label] || RISK_BADGE_STYLES.Low
      )}
    >
      {label}
    </span>
  );
}

function WorkspaceLabRow({
  item,
  lastPaymentByLabId,
  focusLabId,
  directoryUsers,
  onReviewLab,
  onOpenCollections,
  onContactAgent,
  onNavigate,
}) {
  const key = labIdKey(item.labId);
  const agent = resolveLabAgent(item, directoryUsers);
  const lastPayment = formatLastPaymentAge(lastPaymentByLabId[key] || "");
  const lastVisit = str(item.lastFollowUp).slice(0, 10) || "—";

  return (
    <article
      id={key ? `hq-credit-lab-${key}` : undefined}
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3 shadow-sm",
        focusLabId === key && "border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-400/60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">
            <HqObjectLink onClick={() => onReviewLab(item.labId)} title="Review lab">
              {item.labName || item.labId}
            </HqObjectLink>
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Agent:{" "}
            {agent.isAssigned ? (
              <HqObjectLink
                onClick={() => onContactAgent(item, agent)}
                title="Contact agent"
              >
                {agent.displayLabel}
              </HqObjectLink>
            ) : (
              <span className="text-amber-700">Unassigned</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {formatCreditRiskCurrency(item.outstandingAmount)}
          </p>
          {Number(item.overdueDays) > 0 ? (
            <p className="text-[10px] font-medium text-amber-700">{item.overdueDays}d overdue</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Last payment</dt>
          <dd className="font-medium text-slate-800">{lastPayment || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Last visit / follow-up</dt>
          <dd className="font-medium text-slate-800">{lastVisit}</dd>
        </div>
      </dl>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onReviewLab(item.labId)}>
          Review Lab
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onOpenCollections(item.labId)}
        >
          Open Collections
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onContactAgent(item)}
        >
          Contact Agent
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => onNavigate("orders", { labId: item.labId })}
        >
          Orders
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => onNavigate("visits", { labId: item.labId })}
        >
          Visits
        </Button>
      </div>
    </article>
  );
}

export default function HqCreditRiskCommandCenter({
  collections = [],
  searchFiltered = null,
  searchActive = false,
  initialAttentionFilter = "",
  summary = {},
  lastPaymentByLabId = {},
  focusLabId = "",
  setActivePage,
  currentUser,
  onReviewLab,
  onOpenCollections,
}) {
  const [attentionFilter, setAttentionFilter] = useState(
    () => str(initialAttentionFilter) || "ALL"
  );
  const [workspaceBucket, setWorkspaceBucket] = useState("ALL");
  const [directoryUsers, setDirectoryUsers] = useState([]);

  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  useEffect(() => {
    if (!homeTenantId) return;
    let cancelled = false;
    void loadOperationsCenterAdminBundle(homeTenantId).then((bundle) => {
      if (!cancelled) setDirectoryUsers(bundle?.directoryUsers || []);
    });
    return () => {
      cancelled = true;
    };
  }, [homeTenantId]);

  const visibleCollections = useMemo(() => {
    if (!searchActive || !Array.isArray(searchFiltered)) return collections;
    const ids = new Set(searchFiltered.map((c) => labIdKey(c.labId)));
    return collections.filter((c) => ids.has(labIdKey(c.labId)));
  }, [collections, searchFiltered, searchActive]);

  const attentionCards = useMemo(
    () => buildCreditRiskAttentionCards(collections),
    [collections]
  );
  const portfolio = useMemo(
    () => buildCreditRiskPortfolioStrip(collections, summary),
    [collections, summary]
  );
  const filteredForView = useMemo(
    () => filterCollectionsForCreditRiskView(visibleCollections, attentionFilter),
    [visibleCollections, attentionFilter]
  );
  const bucketGroups = useMemo(
    () => groupCollectionsByOverdueBucket(filteredForView),
    [filteredForView]
  );
  const topExposure = useMemo(
    () => buildTopExposureLabs(collections, 10, directoryUsers),
    [collections, directoryUsers]
  );
  const interventions = useMemo(
    () => buildInterventionLabs(collections, lastPaymentByLabId, directoryUsers),
    [collections, lastPaymentByLabId, directoryUsers]
  );

  const workspaceRows = useMemo(() => {
    if (workspaceBucket === "ALL") return filteredForView;
    return bucketGroups[workspaceBucket] || [];
  }, [filteredForView, workspaceBucket, bucketGroups]);

  function handleAttentionAction(card) {
    if (card.page === "labs") {
      navigateToLabs(setActivePage, { creditFilter: "HOLD" });
      return;
    }
    if (card.filter) {
      setAttentionFilter(card.filter);
      setWorkspaceBucket("ALL");
      window.setTimeout(() => {
        document.getElementById("hq-credit-workspace")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
      return;
    }
    if (card.id === "exposure") {
      document.getElementById("hq-credit-exposure")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function handleHqNavigate(kind, payload = {}) {
    if (kind === "orders") {
      navigateToOrders(setActivePage, { labId: payload.labId });
      return;
    }
    if (kind === "visits") {
      navigateToVisits(setActivePage, { labId: payload.labId });
      return;
    }
    if (kind === "collections") {
      navigateToCollections(setActivePage, {
        labId: payload.labId,
        focusSection: payload.focusSection || "details",
        role: currentUser?.role,
      });
    }
  }

  function handleContactAgent(item, agentOverride = null) {
    const agent = agentOverride || resolveLabAgent(item, directoryUsers);
    navigateToOperationsCenter(setActivePage, {
      agentId: agent.agentId,
      agentName: agent.agentName,
      labId: str(item.labId),
    });
  }

  function handleReviewLab(labId) {
    if (onReviewLab) {
      onReviewLab(labId);
      return;
    }
    navigateToLabs(setActivePage, { labId, openReviewDrawer: true });
  }

  return (
    <div className="space-y-4">
      {collections.length === 0 ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm"
          role="status"
          aria-label="All clear"
        >
          <h2 className="text-base font-semibold text-emerald-900">All Clear</h2>
          <p className="mt-1 text-sm text-emerald-800">
            No receivables requiring action in your portfolio. All AR balances are current or no
            collection records are loaded yet.
          </p>
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        What needs attention? Who owns it? How much is at risk? Use the queue below to prioritize
        collections, credit holds, and exposure.
      </p>

      <section aria-label="Collections requiring attention">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Attention Queue</h2>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {attentionCards.map((card) => {
            const Icon = ATTENTION_ICONS[card.id] || AlertTriangle;
            const isActive = attentionFilter === card.filter;
            return (
              <article
                key={card.id}
                className={cn(
                  "flex flex-col rounded-xl border p-3 shadow-sm",
                  SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.healthy,
                  isActive && "ring-2 ring-indigo-400/70"
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="rounded-lg bg-white/80 p-1.5 shadow-sm">
                    <Icon className="h-4 w-4 text-slate-700" />
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{card.count}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                    {SEVERITY_LABELS[card.severity] || "Clear"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-slate-700">
                  {card.outstanding > 0 ? formatCreditRiskCurrency(card.outstanding) : "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">{card.actionText}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={card.count > 0 ? "default" : "outline"}
                  className="mt-2.5 h-8 w-full text-xs"
                  onClick={() => handleAttentionAction(card)}
                >
                  {card.ctaLabel}
                </Button>
              </article>
            );
          })}
        </div>
        {attentionFilter !== "ALL" ? (
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-slate-600"
              onClick={() => setAttentionFilter("ALL")}
            >
              Clear filter · show all labs
            </Button>
          </div>
        ) : null}
      </section>

      <section aria-label="Portfolio at a glance">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <div className="flex items-center gap-1.5">
            <IndianRupee className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">Outstanding</span>
            <span className="font-bold tabular-nums text-slate-900">
              {formatCreditRiskCurrency(portfolio.totalOutstanding)}
            </span>
          </div>
          <span className="hidden text-slate-300 sm:inline">|</span>
          <div>
            <span className="text-slate-600">Labs needing action </span>
            <span className="font-semibold tabular-nums">{portfolio.labsNeedingAction}</span>
          </div>
          <span className="hidden text-slate-300 sm:inline">|</span>
          <div>
            <span className="text-slate-600">Overdue </span>
            <span className="font-semibold tabular-nums">{portfolio.overdueLabs}</span>
          </div>
          <span className="hidden text-slate-300 sm:inline">|</span>
          <div>
            <span className="text-slate-600">On hold </span>
            <span className="font-semibold tabular-nums">{portfolio.onHold}</span>
          </div>
        </div>
      </section>

      {interventions.length > 0 ? (
        <section aria-label="Intervention workflow" className="rounded-xl border border-red-200 bg-red-50/40 p-3">
          <h2 className="mb-2 text-sm font-semibold text-red-900">High-Risk Interventions</h2>
          <p className="mb-3 text-[11px] text-red-800">
            Critical and high exposure accounts — review ownership and follow-up priority.
          </p>
          <div className="space-y-2">
            {interventions.slice(0, 8).map((row) => (
              <div
                key={row.labId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-100 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <HqObjectLink onClick={() => handleReviewLab(row.labId)} title="Review lab">
                      <span className="text-sm font-semibold text-slate-900">{row.labName}</span>
                    </HqObjectLink>
                    <RiskBadge level={row.riskLevel} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {formatCreditRiskCurrency(row.outstanding)}
                    {row.overdueDays > 0 ? ` · ${row.overdueDays}d overdue` : ""}
                    {" · "}
                    Agent: {row.agent}
                    {" · "}
                    Last visit: {row.lastVisit}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => handleReviewLab(row.labId)}
                >
                  Review Lab
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        id="hq-credit-exposure"
        aria-label="Credit exposure"
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Top 10 Credit Exposure</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Lab</th>
                <th className="py-2 pr-2 text-right">Outstanding</th>
                <th className="py-2 pr-2 text-right">Credit limit</th>
                <th className="py-2 pr-2 text-right">Utilization</th>
                <th className="py-2 pr-2">Agent</th>
                <th className="py-2">Risk</th>
              </tr>
            </thead>
            <tbody>
              {topExposure.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No outstanding balances in portfolio.
                  </td>
                </tr>
              ) : (
                topExposure.map((row) => (
                  <tr key={row.labId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2">
                      <HqObjectLink onClick={() => handleReviewLab(row.labId)} title="Review lab">
                        {row.labName}
                      </HqObjectLink>
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                      {formatCreditRiskCurrency(row.outstanding)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-700">
                      {row.creditLimit > 0 ? formatCreditRiskCurrency(row.creditLimit) : "—"}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {row.utilizationPct != null ? `${row.utilizationPct}%` : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {row.assignedAgent !== "Unassigned" ? (
                        <HqObjectLink
                          onClick={() =>
                            navigateToOperationsCenter(setActivePage, {
                              agentId: row.assignedAgentId,
                              agentName: row.assignedAgent,
                              labId: row.labId,
                            })
                          }
                          title="Assigned agent"
                        >
                          {row.assignedAgent}
                        </HqObjectLink>
                      ) : (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2">
                      <RiskBadge level={row.riskLevel} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="hq-credit-workspace"
        aria-label="Collections workspace"
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Collections Workspace</h2>
          <span className="text-[11px] text-slate-500">{workspaceRows.length} labs shown</span>
        </div>

        {searchActive && visibleCollections.length === 0 && collections.length > 0 ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
            No labs match your search. Clear the search box to see the full portfolio.
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={workspaceBucket === "ALL" ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => setWorkspaceBucket("ALL")}
          >
            All buckets
          </Button>
          {OVERDUE_BUCKET_ORDER.map((bucket) => {
            const count = bucketGroups[bucket]?.length || 0;
            return (
              <Button
                key={bucket}
                type="button"
                size="sm"
                variant={workspaceBucket === bucket ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => setWorkspaceBucket(bucket)}
              >
                {OVERDUE_BUCKET_LABELS[bucket]} ({count})
              </Button>
            );
          })}
        </div>

        {workspaceBucket === "ALL" ? (
          <div className="space-y-4">
            {OVERDUE_BUCKET_ORDER.map((bucket) => {
              const rows = bucketGroups[bucket] || [];
              if (!rows.length) return null;
              return (
                <div key={bucket}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {OVERDUE_BUCKET_LABELS[bucket]} ({rows.length})
                  </h3>
                  <div className="space-y-2">
                    {rows.map((item) => (
                      <WorkspaceLabRow
                        key={labIdKey(item.labId)}
                        item={item}
                        lastPaymentByLabId={lastPaymentByLabId}
                        focusLabId={focusLabId}
                        directoryUsers={directoryUsers}
                        onReviewLab={handleReviewLab}
                        onOpenCollections={onOpenCollections}
                        onContactAgent={handleContactAgent}
                        onNavigate={handleHqNavigate}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredForView.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No labs match this filter.</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {workspaceRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No labs in this bucket.</p>
            ) : (
              workspaceRows.map((item) => (
                <WorkspaceLabRow
                  key={labIdKey(item.labId)}
                  item={item}
                  lastPaymentByLabId={lastPaymentByLabId}
                  focusLabId={focusLabId}
                  directoryUsers={directoryUsers}
                  onReviewLab={handleReviewLab}
                  onOpenCollections={onOpenCollections}
                  onContactAgent={handleContactAgent}
                  onNavigate={handleHqNavigate}
                />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
