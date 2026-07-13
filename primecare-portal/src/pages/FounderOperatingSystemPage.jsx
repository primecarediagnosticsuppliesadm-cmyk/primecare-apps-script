import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  PageSkeleton,
  DataFetchError,
  StatusBadge,
  usePortalToast,
} from "@/components/ux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Compass, ExternalLink } from "lucide-react";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import FounderModuleNav from "@/components/founder/FounderModuleNav.jsx";
import FounderPerformanceCards from "@/components/founder/FounderPerformanceCards.jsx";
import { EnterpriseMetricStrip } from "@/components/ux";
import {
  FOUNDER_OS_MODULES,
  buildFounderOsBreadcrumbs,
  defaultFounderOsRoute,
  resolveFounderOsRoute,
} from "@/founder/founderOperatingNavigation.js";
import { loadFounderWorkspaceRead } from "@/founder/founderWorkspaceRead.js";
import { buildFounderWorkspace } from "@/founder/founderWorkspaceModel.js";
import {
  FOUNDER_SEARCH_GROUPS,
  buildFounderSearchIndex,
  searchFounderIndex,
} from "@/founder/founderGlobalSearchModel.js";
import { usePagePerformance } from "@/hooks/usePagePerformance.js";

function MetricGrid({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DeepLinkButton({ label, page, setActivePage }) {
  if (!setActivePage || !page) return null;
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => setActivePage(page)}>
      <ExternalLink className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

function DecisionList({ items, setActivePage }) {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground">No decisions in queue.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.title}</p>
            <p className="text-xs text-muted-foreground">{row.reason}</p>
            <StatusBadge variant={row.severity === "high" || row.severity === "critical" ? "danger" : "warning"} className="mt-1">
              {row.businessImpact || row.severity}
            </StatusBadge>
          </div>
          <DeepLinkButton label={row.deepLinkLabel || "Open"} page={row.deepLinkPage} setActivePage={setActivePage} />
        </li>
      ))}
    </ul>
  );
}

export default function FounderOperatingSystemPage({ currentUser = null, setActivePage = null }) {
  const [route, setRoute] = useState(() => defaultFounderOsRoute());
  const { moduleId } = useMemo(() => resolveFounderOsRoute(route.moduleId, route.screenId), [route]);
  const [readBundle, setReadBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGroup, setSearchGroup] = useState("all");
  const { showToast } = usePortalToast();
  usePagePerformance("Founder OS");

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        const bundle = await loadFounderWorkspaceRead({ currentUser, force: refresh });
        setReadBundle(bundle);
      } catch (err) {
        setError(err?.message || "Could not load Founder workspace");
        showToast?.({ title: "Load failed", description: err?.message, variant: "destructive" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser, showToast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const workspace = useMemo(() => (readBundle ? buildFounderWorkspace(readBundle) : null), [readBundle]);
  const searchIndex = useMemo(() => (readBundle ? buildFounderSearchIndex(readBundle) : []), [readBundle]);
  const searchResults = useMemo(
    () => searchFounderIndex(searchIndex, searchQuery, { groupId: searchGroup }),
    [searchIndex, searchQuery, searchGroup]
  );

  const breadcrumbs = useMemo(() => buildFounderOsBreadcrumbs({ moduleId, screenId: route.screenId }), [moduleId, route.screenId]);

  if (loading && !workspace) return <PageSkeleton rows={12} />;
  if (error && !workspace) {
    return <DataFetchError message={error} onRetry={() => load({ refresh: true })} retrying={refreshing} />;
  }
  if (!workspace) return null;

  const tb = workspace.todaysBusiness;

  return (
    <div className="space-y-3 pb-6">
      <PageHeader
        title="Founder Command Center"
        subtitle="What requires your decision today — composed from existing modules, no duplicate logic."
        icon={Compass}
        compact
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => load({ refresh: true })} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <PeopleOpsBreadcrumbs items={breadcrumbs} />
      <FounderModuleNav
        modules={FOUNDER_OS_MODULES}
        activeModuleId={moduleId}
        onSelect={(id) => setRoute(resolveFounderOsRoute(id, "home"))}
      />

      {moduleId === "today" ? (
        <div className="space-y-3">
          <EnterpriseMetricStrip
            items={[
              { id: "revenue", label: "Today's Revenue", value: tb.todayRevenue },
              { id: "collections", label: "Collections Today", value: tb.todayCollections },
              { id: "orders", label: "Orders", value: tb.todayOrders },
              { id: "labs", label: "New Labs", value: tb.todayNewLabs },
              { id: "cash", label: "Cash / AR", value: tb.cashPosition },
              { id: "payroll", label: "Payroll", value: tb.payrollStatus },
            ]}
          />
          <PeopleOpsSectionCard title="Today's Business" subtitle="Operational pulse" dense={false}>
            <MetricGrid
              items={[
                { label: "Deliveries", value: tb.todayDeliveries },
                { label: "Outstanding", value: tb.outstandingCollections },
                { label: "Inventory", value: tb.inventoryHealth },
                { label: "Pipeline", value: tb.pipelineValue },
                { label: "Conversion", value: tb.conversion },
              ]}
            />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Top 5 Founder Priorities" subtitle="Rule-based ranking from decisions and insights">
            <ul className="space-y-2">
              {workspace.priorities.items.map((item, idx) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {idx + 1}. {item.priority}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Impact: {item.businessImpact}</p>
                  </div>
                  <DeepLinkButton label={item.deepLinkLabel} page={item.deepLinkPage} setActivePage={setActivePage} />
                </li>
              ))}
            </ul>
          </PeopleOpsSectionCard>
          <FounderPerformanceCards
            cards={workspace.performanceCards?.cards || []}
            onNavigate={(page) => setActivePage?.(page)}
          />
        </div>
      ) : null}

      {moduleId === "decisions" ? (
        <PeopleOpsSectionCard title="Decision Queue" subtitle="Composed from executive action queue, approvals, and HQ priority cards">
          <DecisionList items={workspace.decisionQueue.items} setActivePage={setActivePage} />
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "revenue" ? (
        <PeopleOpsSectionCard title="Revenue" subtitle="Commercial + EFI read façades">
          <MetricGrid
            items={[
              { label: "Current Month (today proxy)", value: workspace.revenue.currentMonthRevenue },
              { label: "Forecast", value: workspace.revenue.forecastRevenue },
              { label: "Pipeline", value: workspace.revenue.pipelineValue },
              { label: "Conversion", value: workspace.revenue.conversion },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <DeepLinkButton label="Executive FI" page={workspace.revenue.deepLinkPage} setActivePage={setActivePage} />
            <DeepLinkButton label="Commercial" page={workspace.revenue.commercialDeepLink} setActivePage={setActivePage} />
          </div>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "collections" ? (
        <PeopleOpsSectionCard title="Collections" subtitle="Credit & Risk SoT">
          <MetricGrid
            items={[
              { label: "Collected Today", value: workspace.collections.collectedToday },
              { label: "Outstanding", value: workspace.collections.outstanding },
              { label: "Overdue Accounts", value: workspace.collections.overdueCount },
              { label: "High Risk", value: workspace.collections.highRiskCount },
            ]}
          />
          <DeepLinkButton label="Credit & Risk" page={workspace.collections.deepLinkPage} setActivePage={setActivePage} />
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "operations" ? (
        <PeopleOpsSectionCard title="Operations" subtitle="Operations Center compose">
          <MetricGrid
            items={[
              { label: "Orders Waiting", value: workspace.operations.ordersWaiting },
              { label: "Shipments Delayed", value: workspace.operations.shipmentsDelayed },
              { label: "Procurement Delays", value: workspace.operations.procurementDelays },
              { label: "Inventory Exceptions", value: workspace.operations.inventoryExceptions },
              { label: "System Alerts", value: workspace.operations.systemAlerts },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <DeepLinkButton label="Operations Center" page={workspace.operations.deepLinkOps} setActivePage={setActivePage} />
            <DeepLinkButton label="Orders" page={workspace.operations.deepLinkOrders} setActivePage={setActivePage} />
          </div>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "people" ? (
        <PeopleOpsSectionCard title="People" subtitle="People Operations read bundle">
          <MetricGrid
            items={[
              { label: "Headcount", value: workspace.people.headcount },
              { label: "Payroll Status", value: workspace.people.payrollStatus },
              { label: "Without Plans", value: workspace.people.employeesWithoutPlans },
              { label: "Pending Approvals", value: workspace.people.pendingApprovals },
              { label: "Promotion Reviews", value: workspace.people.promotionReviews },
            ]}
          />
          <DeepLinkButton label="People Operations" page={workspace.people.deepLinkPage} setActivePage={setActivePage} />
          <div className="mt-4">
            <FounderPerformanceCards
              cards={workspace.performanceCards?.cards || []}
              onNavigate={(page) => setActivePage?.(page)}
            />
          </div>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "inventory" ? (
        <PeopleOpsSectionCard title="Inventory" subtitle="Stock dashboard compose">
          <MetricGrid
            items={[
              { label: "Low Stock", value: workspace.inventory.lowStockCount },
              { label: "Purchase Required", value: workspace.inventory.purchaseRequired },
              { label: "Blocked Items", value: workspace.inventory.blockedItems },
            ]}
          />
          <DeepLinkButton label="Inventory" page={workspace.inventory.deepLinkPage} setActivePage={setActivePage} />
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "growth" ? (
        <PeopleOpsSectionCard title="Growth" subtitle="Commercial workspace">
          <MetricGrid
            items={[
              { label: "Meetings (week)", value: workspace.growth.meetingsThisWeek },
              { label: "Contracts Pending", value: workspace.growth.contractsPending },
              { label: "Activated Labs", value: workspace.growth.activated },
            ]}
          />
          <DeepLinkButton label="Commercial" page={workspace.growth.deepLinkPage} setActivePage={setActivePage} />
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "risks" ? (
        <PeopleOpsSectionCard title="Risks" subtitle="Aggregated financial, operational, commercial, people, inventory, credit">
          <ul className="space-y-2">
            {workspace.risks.items.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.domain} · {row.reason}</p>
                </div>
                <DeepLinkButton label="Open" page={row.deepLinkPage} setActivePage={setActivePage} />
              </li>
            ))}
          </ul>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "forecast" ? (
        <PeopleOpsSectionCard title="Forecast" subtitle="Commercial forecast proxy + People Ops note">
          <MetricGrid
            items={[
              { label: "Expected Revenue", value: workspace.forecast.commercialForecast?.expectedRevenueLabel || "—" },
              { label: "Expected Collections", value: workspace.forecast.commercialForecast?.expectedCollectionsLabel || "—" },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">{workspace.forecast.payrollForecastNote}</p>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "approvals" ? (
        <PeopleOpsSectionCard title="Approvals" subtitle="People Ops approval inbox — no duplicate engine">
          <DecisionList
            items={workspace.approvals.items.map((row) => ({
              id: row.id,
              title: row.title,
              reason: row.detail,
              businessImpact: row.tone,
              severity: row.tone,
              deepLinkPage: workspace.approvals.deepLinkPage,
              deepLinkLabel: "People Operations",
            }))}
            setActivePage={setActivePage}
          />
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "insights" ? (
        <PeopleOpsSectionCard title="Founder Insights" subtitle="Pure rules — no AI/ML">
          <ul className="space-y-2">
            {workspace.insights.items.map((row) => (
              <li key={row.id} className="rounded-lg border px-3 py-2">
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.reason}</p>
                <div className="mt-2">
                  <DeepLinkButton label={row.actionLabel} page={row.actionPage} setActivePage={setActivePage} />
                </div>
              </li>
            ))}
          </ul>
        </PeopleOpsSectionCard>
      ) : null}

      {moduleId === "search" ? (
        <PeopleOpsSectionCard title="Global Search" subtitle="Extends HQ search index with founder context">
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search labs, employees, orders, contracts…"
              className="max-w-md"
            />
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={searchGroup}
              onChange={(e) => setSearchGroup(e.target.value)}
            >
              <option value="all">All groups</option>
              {FOUNDER_SEARCH_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <ul className="space-y-1">
            {searchResults.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => setActivePage?.(row.page)}
                >
                  <span>
                    <span className="font-medium">{row.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{row.subtitle}</span>
                  </span>
                  <span className="text-xs uppercase text-muted-foreground">{row.group}</span>
                </button>
              </li>
            ))}
          </ul>
        </PeopleOpsSectionCard>
      ) : null}
    </div>
  );
}
