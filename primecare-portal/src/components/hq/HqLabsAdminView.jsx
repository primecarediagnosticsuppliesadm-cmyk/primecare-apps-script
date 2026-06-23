import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OperationalLabDrawer from "@/components/operations/OperationalLabDrawer.jsx";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import {
  buildLabsAttentionCards,
  buildLabsPortfolioSummary,
  buildAgentCoverage,
  filterLabsForAttention,
  formatLabsCurrency,
  formatLabsDate,
  hasLabField,
} from "@/operations/labsHqEngine.js";
import {
  resolveLabAgent,
  labAssignedAgentId,
  isLabAssigned,
} from "@/operations/labAgentResolver.js";
import { enterDistributorOs } from "@/tenant/tenantFoundationStore.js";
import {
  navigateToCollections,
  navigateToOperationsCenter,
  navigateToOrders,
  navigateToVisits,
} from "@/operations/hqWorkflowNav.js";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import { labIdKey } from "@/utils/labId.js";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  IndianRupee,
  UserX,
  CalendarClock,
  ShieldAlert,
  Users,
} from "lucide-react";

const ATTENTION_ICONS = {
  outstanding: IndianRupee,
  hold: ShieldAlert,
  followups: CalendarClock,
  unassigned: UserX,
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

function str(v) {
  return String(v ?? "").trim();
}

function CreditBadge({ status }) {
  const s = String(status || "OK").toUpperCase();
  const cls =
    s === "HOLD"
      ? "bg-red-100 text-red-700"
      : s === "NEAR_LIMIT"
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-800";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {s === "NEAR_LIMIT" ? "Near Limit" : s === "HOLD" ? "Hold" : "OK"}
    </span>
  );
}

function HqLabDirectoryCard({
  lab,
  focusLabId,
  homeTenantId,
  directoryUsers,
  onReviewLab,
  onOpenDistributorOs,
  onNavigate,
}) {
  const outstanding = Number(lab.outstandingAmount ?? lab.outstanding ?? 0);
  const revenue = Number(lab.revenue ?? 0);
  const canOpenDistributor =
    str(lab.tenantId) && str(lab.tenantId) !== str(homeTenantId);
  const lastVisit = formatLabsDate(lab.lastVisit);
  const agent = resolveLabAgent(lab, directoryUsers);

  return (
    <article
      id={lab.labId ? `hq-lab-row-${labIdKey(lab.labId)}` : undefined}
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow",
        focusLabId && labIdKey(lab.labId) === focusLabId &&
          "border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-400/60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-900">
              <HqObjectLink onClick={() => onReviewLab(lab)} title="Review lab">
                {lab.labName || "Unnamed Lab"}
              </HqObjectLink>
            </h3>
            <CreditBadge status={lab.creditStatus} />
            {hasLabField(lab.status) ? (
              <Badge variant="secondary" className="text-[10px]">
                {lab.status}
              </Badge>
            ) : null}
            {hasLabField(lab.stage) ? (
              <Badge variant="outline" className="text-[10px]">
                {lab.stage}
              </Badge>
            ) : null}
          </div>
          {hasLabField(lab.labId) ? (
            <p className="mt-0.5 text-[11px] text-slate-500">ID {lab.labId}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Outstanding</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatLabsCurrency(outstanding)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Revenue</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatLabsCurrency(revenue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Assigned Agent</dt>
          <dd className={cn("font-medium", agent.isAssigned ? "text-slate-800" : "text-amber-700")}>
            {agent.isAssigned ? (
              <HqObjectLink
                onClick={() =>
                  onNavigate?.("agent", {
                    agentId: agent.agentId || labAssignedAgentId(lab),
                    agentName: agent.agentName,
                  })
                }
                title="Manage agent assignments"
              >
                {agent.displayLabel}
              </HqObjectLink>
            ) : (
              "Unassigned"
            )}
          </dd>
        </div>
        {lastVisit ? (
          <div>
            <dt className="text-slate-500">Last Visit</dt>
            <dd className="font-medium text-slate-800">{lastVisit}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onReviewLab(lab)}>
          Review Lab
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onNavigate?.("orders", { labId: lab.labId })}
        >
          Orders
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onNavigate?.("collections", { labId: lab.labId })}
        >
          Collections
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => onNavigate?.("visits", { labId: lab.labId })}
        >
          Visits
        </Button>
        {canOpenDistributor ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => onOpenDistributorOs(lab)}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Open in Distributor OS
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function AgentCoverageCard({ agent, onManageAgent, onReviewLab }) {
  return (
    <button
      type="button"
      onClick={() => onManageAgent(agent)}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition",
        "hover:border-indigo-300 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{agent.agentName}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {agent.labCount} lab{agent.labCount === 1 ? "" : "s"} assigned
          </p>
        </div>
        {agent.multiLab ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            Multi-lab
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-700" onClick={(e) => e.stopPropagation()}>
        {agent.labNames.map((name, idx) => (
          <span key={`${agent.agentId}-${name}`}>
            {idx > 0 ? ", " : null}
            <HqObjectLink
              onClick={() => {
                const lab = agent.labs[idx];
                if (lab) onReviewLab?.({ labId: lab.labId, labName: lab.labName });
              }}
              title="Review lab"
            >
              {name}
            </HqObjectLink>
          </span>
        ))}
      </p>
      <p className="mt-2 text-xs font-semibold tabular-nums text-slate-900">
        Outstanding: {formatLabsCurrency(agent.totalOutstanding)}
      </p>
    </button>
  );
}

export default function HqLabsAdminView({
  visibleLabs,
  summary,
  creditFilter,
  setCreditFilter,
  setActivePage,
  currentUser,
  focusLabId = "",
  initialReviewLabId = "",
}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const [reviewLabId, setReviewLabId] = useState("");
  const [opsPayload, setOpsPayload] = useState(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState(null);
  const [directoryUsers, setDirectoryUsers] = useState([]);

  const attentionCards = useMemo(
    () => buildLabsAttentionCards(visibleLabs, directoryUsers),
    [visibleLabs, directoryUsers]
  );
  const portfolio = useMemo(
    () => buildLabsPortfolioSummary(visibleLabs, summary),
    [visibleLabs, summary]
  );
  const agentCoverage = useMemo(
    () => buildAgentCoverage(visibleLabs, directoryUsers),
    [visibleLabs, directoryUsers]
  );

  const directoryFilter = attentionFilter || creditFilter;
  const filteredLabs = useMemo(
    () => filterLabsForAttention(visibleLabs, directoryFilter, directoryUsers),
    [visibleLabs, directoryFilter, directoryUsers]
  );

  const reviewLab = useMemo(
    () => visibleLabs.find((lab) => labIdKey(lab.labId) === reviewLabId) || null,
    [visibleLabs, reviewLabId]
  );

  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    try {
      const data = await loadOperationsCommandCenterData(currentUser, { force: true });
      setOpsPayload(data);
    } finally {
      setOpsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (initialReviewLabId) setReviewLabId(initialReviewLabId);
  }, [initialReviewLabId]);

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

  useEffect(() => {
    if (reviewLabId && !opsPayload && !opsLoading) {
      void loadOps();
    }
  }, [reviewLabId, opsPayload, opsLoading, loadOps]);

  function handleAttentionAction(card) {
    if (card.filter === "HOLD") {
      setAttentionFilter(null);
      setCreditFilter("HOLD");
      return;
    }
    if (card.filter) {
      setAttentionFilter(String(card.filter).toUpperCase());
      setCreditFilter("ALL");
      return;
    }
    if (card.page) {
      if (card.page === "operationsCenter") {
        navigateToOperationsCenter(setActivePage, {
          openAssignDrawer: String(card.filter).toLowerCase() === "unassigned",
        });
      } else {
        setActivePage?.(card.page);
      }
      return;
    }
  }

  function handleCreditChip(filter) {
    setAttentionFilter(null);
    setCreditFilter(filter);
  }

  function handleReviewLab(lab) {
    setReviewLabId(labIdKey(lab.labId));
  }

  function handleDrawerAction(action, snapshot) {
    const lab = reviewLab;
    setReviewLabId("");
    if (action === "operationsCenter") {
      navigateToOperationsCenter(setActivePage, {
        agentId: labAssignedAgentId(lab) || "",
        agentName: resolveLabAgent(lab, directoryUsers).agentName || "",
        openAssignDrawer: isLabAssigned(lab, directoryUsers),
        labId: lab?.labId || "",
      });
      return;
    }
    if (action === "collections") {
      navigateToCollections(setActivePage, { labId: lab?.labId, focusSection: "details" });
      return;
    }
    if (action === "orders") {
      navigateToOrders(setActivePage, { labId: lab?.labId });
      return;
    }
    if (action === "orderReview") {
      navigateToOrders(setActivePage, {
        labId: lab?.labId,
        orderId: snapshot?.orderId || "",
      });
      return;
    }
    if (action === "visits") {
      navigateToVisits(setActivePage, { labId: lab?.labId });
    }
  }

  function handleHqNavigate(kind, payload = {}) {
    if (kind === "orders") navigateToOrders(setActivePage, payload);
    else if (kind === "collections") navigateToCollections(setActivePage, payload);
    else if (kind === "visits") navigateToVisits(setActivePage, payload);
    else if (kind === "agent") {
      navigateToOperationsCenter(setActivePage, {
        agentId: payload.agentId || "",
        agentName: payload.agentName || "",
        openAssignDrawer: true,
      });
    } else if (kind === "reviewLab") {
      handleReviewLab(payload.lab || { labId: payload.labId });
    }
  }

  function handleOpenDistributorOs(lab) {
    const tenantId = str(lab.tenantId);
    if (!tenantId || !homeTenantId || tenantId === homeTenantId) return;
    enterDistributorOs({
      tenantId,
      tenantName: lab.labName || "",
      homeTenantId,
      tab: "labs",
    });
    setActivePage?.("distributorOs");
  }

  function navigateToOperationsCenterPage(context = {}) {
    navigateToOperationsCenter(setActivePage, context);
  }

  function handleManageAssignments() {
    navigateToOperationsCenterPage();
  }

  function handleManageAgent(agent) {
    navigateToOperationsCenterPage({
      agentId: agent?.agentId || "",
      agentName: agent?.agentName || "",
      openAssignDrawer: true,
    });
  }

  function handleManageUnassigned() {
    navigateToOperationsCenterPage();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Which lab needs your attention today? Start with the attention queue, then review accounts in the directory.
      </p>

      <section aria-label="Labs requiring attention">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Labs Requiring Attention</h2>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {attentionCards.map((card) => {
            const Icon = ATTENTION_ICONS[card.id] || AlertTriangle;
            return (
              <article
                key={card.id}
                className={cn(
                  "flex flex-col rounded-xl border p-3 shadow-sm",
                  SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.healthy
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
                <p className="mt-1 text-[11px] text-slate-600">{card.actionText}</p>
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
      </section>

      <section aria-label="Portfolio summary">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Portfolio Summary</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Total Labs", value: portfolio.totalLabs },
            { label: "Active Labs", value: portfolio.activeLabs },
            { label: "Revenue", value: formatLabsCurrency(portfolio.revenue) },
            { label: "Outstanding", value: formatLabsCurrency(portfolio.outstanding) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{kpi.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Agent coverage" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">Agent Coverage</h2>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={handleManageAssignments}>
            Manage Assignments
          </Button>
        </div>
        <p className="mb-3 text-[11px] text-slate-600">
          Lab distribution by field agent — click an agent to open assignments in User &amp; Access.
        </p>

        {agentCoverage.agents.length === 0 && agentCoverage.unassigned.count === 0 ? (
          <p className="py-3 text-center text-sm text-slate-500">No labs in this portfolio yet.</p>
        ) : (
          <div className="space-y-3">
            {agentCoverage.agents.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {agentCoverage.agents.map((agent) => (
                  <AgentCoverageCard
                    key={agent.agentId || agent.agentName}
                    agent={agent}
                    onManageAgent={handleManageAgent}
                    onReviewLab={handleReviewLab}
                  />
                ))}
              </div>
            ) : null}

            {agentCoverage.unassigned.count > 0 ? (
              <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Unassigned Labs</p>
                    <p className="mt-0.5 text-[11px] text-amber-800">
                      {agentCoverage.unassigned.count} lab
                      {agentCoverage.unassigned.count === 1 ? "" : "s"} without a field agent
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-300 text-xs text-amber-900 hover:bg-amber-100"
                    onClick={handleManageUnassigned}
                  >
                    Assign in Operations Center
                  </Button>
                </div>
                <p className="mt-2 text-xs text-amber-900">{agentCoverage.unassigned.labNames.join(", ")}</p>
                {agentCoverage.unassigned.totalOutstanding > 0 ? (
                  <p className="mt-1 text-xs font-semibold tabular-nums text-amber-900">
                    Outstanding: {formatLabsCurrency(agentCoverage.unassigned.totalOutstanding)}
                  </p>
                ) : null}
              </article>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Lab directory" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Lab Directory</h2>
          <span className="text-[11px] text-slate-500">
            {filteredLabs.length} of {visibleLabs.length} labs
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {["ALL", "OK", "NEAR_LIMIT", "HOLD"].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => handleCreditChip(filter)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                !attentionFilter && creditFilter === filter
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              )}
            >
              {filter === "NEAR_LIMIT" ? "Near Limit" : filter === "ALL" ? "All" : filter}
            </button>
          ))}
          {attentionFilter ? (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800">
              Filter: {attentionFilter.replace(/_/g, " ")}
              <button
                type="button"
                className="ml-1 underline"
                onClick={() => setAttentionFilter(null)}
              >
                clear
              </button>
            </span>
          ) : null}
        </div>

        {filteredLabs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No labs match the current filter.</p>
        ) : (
          <div className="space-y-2">
            {filteredLabs.map((lab, idx) => (
              <HqLabDirectoryCard
                key={`${lab.labId || lab.labName}-${idx}`}
                lab={lab}
                focusLabId={focusLabId}
                homeTenantId={homeTenantId}
                directoryUsers={directoryUsers}
                onReviewLab={handleReviewLab}
                onOpenDistributorOs={handleOpenDistributorOs}
                onNavigate={handleHqNavigate}
              />
            ))}
          </div>
        )}
      </section>

      <OperationalLabDrawer
        open={Boolean(reviewLabId)}
        onClose={() => setReviewLabId("")}
        labId={reviewLabId}
        labRecord={reviewLab}
        opsPayload={opsPayload}
        directoryUsers={directoryUsers}
        onAction={handleDrawerAction}
        currentUser={currentUser}
      />
    </div>
  );
}
