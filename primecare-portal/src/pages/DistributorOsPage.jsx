import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  DISTRIBUTOR_OS_TABS,
  buildDistributorOsScope,
  distributorOsBannerText,
  filterDistributorRegistry,
  isValidDistributorOsScope,
} from "@/distributor/distributorOsEngine.js";
import { loadDistributorOsSnapshot } from "@/distributor/distributorOsData.js";
import { loadDistributorOsPortfolio } from "@/distributor/distributorOsPortfolioData.js";
import { applyDistributorLifecycleAction } from "@/distributor/distributorLifecycleData.js";
import {
  canDistributorOperate,
  enrichRegistryRowLifecycle,
  lifecycleStatusLabel,
  lifecycleStatusVariant,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";
import {
  consumeDistributorOsTabPreset,
  enterDistributorOs,
  readDistributorOsContext,
  setDistributorOsContext,
} from "@/tenant/tenantFoundationStore.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import LabsPage from "@/pages/LabsPage.jsx";
import OrdersPage from "@/pages/OrdersPage.jsx";
import CollectionsPage from "@/pages/CollectionsPage.jsx";
import LabContractManagementPage from "@/pages/LabContractManagementPage.jsx";
import CommissionEnginePage from "@/pages/CommissionEnginePage.jsx";
import DistributorProvisioningPage from "@/pages/DistributorProvisioningPage.jsx";
import DistributorCreateWizard from "@/components/distributor/DistributorCreateWizard.jsx";
import {
  BillingPanel,
  DashboardPanel,
  LifecycleActionsPanel,
  OperationRestrictionBanner,
  PerformancePanel,
} from "@/components/distributor/DistributorOsV2Panels.jsx";
import { cn } from "@/lib/utils";
import { Building2, Plus, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { ROLES } from "@/config/roles";

const HEALTH_VARIANT = { Healthy: "success", Watch: "warning", Risk: "danger" };

function AgentsPanel({ agents = [], tenantName = "" }) {
  if (!agents.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No agents registered for {tenantName || "this distributor"} yet.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {agents.map((a) => (
        <div key={a.user_id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <p className="font-semibold text-slate-900">{a.agent_name || "Agent"}</p>
          </div>
          <p className="mt-1 text-slate-500">Role: {a.role}</p>
          <p className="text-slate-500">Status: {a.active === false ? "Inactive" : "Active"}</p>
        </div>
      ))}
    </div>
  );
}

function RisksPanel({ workspace, collections = [], performance }) {
  const workspaceRisks = workspace?.risks || [];
  const creditRisks = collections.filter(
    (c) =>
      String(c.riskStatus || "").toLowerCase() === "high" ||
      String(c.creditHold || "").toUpperCase() === "HOLD"
  );

  if (!workspaceRisks.length && !creditRisks.length && !performance?.contractExpired) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        No elevated risks detected for this distributor.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {performance?.contractExpired ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
          <p className="font-semibold text-red-950">Contract expired</p>
          <p className="text-red-800">Renewal needed — operations are blocked until contract is renewed.</p>
        </div>
      ) : null}
      {workspaceRisks.map((r) => (
        <div key={r.id || r.title} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <p className="font-semibold text-amber-950">{r.title}</p>
          <p className="text-amber-900">{r.detail || r.description}</p>
        </div>
      ))}
      {creditRisks.map((c) => (
        <div key={c.labId} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
          <p className="font-semibold text-red-950">{c.labName || c.labId}</p>
          <p className="text-red-800">
            Outstanding ₹{Number(c.outstandingAmount || 0).toLocaleString("en-IN")} ·{" "}
            {c.riskStatus || "High"} risk
          </p>
        </div>
      ))}
    </div>
  );
}

function ScopeRequiredMessage({ tabLabel = "this tab" }) {
  return (
    <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Select a distributor above to use {tabLabel}.
    </p>
  );
}

export default function DistributorOsPage({
  currentUser = null,
  setActivePage = null,
  authToken = null,
}) {
  const homeTenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState(null);
  const [osContext, setOsContext] = useState(() => readDistributorOsContext());
  const [tab, setTab] = useState(() => readDistributorOsContext()?.tab || "dashboard");
  const [snapshot, setSnapshot] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleMsg, setLifecycleMsg] = useState("");

  const effectiveHomeId = homeTenantId || currentUser?.tenantId || "";
  const registry = portfolio?.distributors || [];

  const distributors = useMemo(() => {
    if (currentUser?.role === ROLES.ADMIN && currentUser?.tenantId) {
      const own = registry.find((r) => r.id === currentUser.tenantId);
      return own && !own.isHome ? [own] : [];
    }
    return filterDistributorRegistry(registry, effectiveHomeId);
  }, [registry, effectiveHomeId, currentUser]);

  const selectedId = osContext?.tenantId || "";
  const selectedRow = distributors.find((d) => d.id === selectedId) || null;
  const enrichedRow = selectedRow ? enrichRegistryRowLifecycle(selectedRow) : null;
  const selectedName =
    osContext?.tenantName || selectedRow?.name || selectedRow?.config?.companyName || "";

  const scope = useMemo(() => {
    if (!isValidDistributorOsScope({ tenantId: selectedId }, effectiveHomeId)) return null;
    const lifecycleStatus = resolveDistributorLifecycleStatus(enrichedRow || selectedRow || {});
    const config = enrichedRow?.config || selectedRow?.config || {};
    return buildDistributorOsScope({
      tenantId: selectedId,
      tenantName: selectedName,
      homeTenantId: effectiveHomeId,
      lifecycleStatus,
      canOperate: canDistributorOperate(lifecycleStatus, config),
    });
  }, [selectedId, selectedName, effectiveHomeId, enrichedRow, selectedRow]);

  const selectedPerformance = useMemo(() => {
    if (!selectedId || !portfolio?.performanceRows) return null;
    return portfolio.performanceRows.find((r) => r.distributorId === selectedId) || null;
  }, [selectedId, portfolio]);

  const selectedBilling = useMemo(() => {
    if (!selectedId || !portfolio?.billingRows) return null;
    return portfolio.billingRows.find((r) => r.distributorId === selectedId) || null;
  }, [selectedId, portfolio]);

  const loadPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadDistributorOsPortfolio(currentUser, { force: true });
      setPortfolio(data);
    } catch (err) {
      console.error(err);
      setPortfolio(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const loadSnapshot = useCallback(async () => {
    if (!scope?.tenantId) {
      setSnapshot(null);
      return;
    }
    try {
      const data = await loadDistributorOsSnapshot(currentUser, scope.tenantId);
      setSnapshot(data);
    } catch (err) {
      console.warn("[DistributorOs] snapshot", err);
      setSnapshot(null);
    }
  }, [currentUser, scope?.tenantId]);

  useEffect(() => {
    const presetTab = consumeDistributorOsTabPreset();
    if (presetTab) setTab(presetTab);
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!selectedId || !effectiveHomeId) return;
    if (selectedId === effectiveHomeId) return;
    enterDistributorOs({
      tenantId: selectedId,
      tenantName: selectedName,
      homeTenantId: effectiveHomeId,
      tab,
    });
    setOsContext(readDistributorOsContext());
  }, [selectedId, selectedName, effectiveHomeId, tab]);

  const catalogReady = Boolean(enrichedRow?.config?.productCatalogReady);

  const predatorSnapshot = useMemo(() => {
    const base = {
      distributorOs: true,
      distributorOsV2: true,
      homeTenantId: effectiveHomeId,
      globalViewTenantId: effectiveHomeId,
      tab,
      portfolio: portfolio?.dashboard || null,
      billingRows: portfolio?.billingRows || [],
      performanceRows: portfolio?.performanceRows || [],
      comparison: portfolio?.comparison || [],
      hqLeakCount: portfolio?.hqLeakCount ?? 0,
      totalRevenue: portfolio?.totalRevenue ?? 0,
    };
    if (!scope) return base;
    return {
      ...base,
      scopeTenantId: scope.tenantId,
      scopeTenantName: scope.tenantName,
      lifecycleStatus: scope.lifecycleStatus,
      canOperate: scope.canOperate,
      labCount: snapshot?.labs?.length ?? 0,
      orderCount: snapshot?.orders?.length ?? 0,
      collectionCount: snapshot?.collections?.length ?? 0,
      contractCount: snapshot?.contracts?.length ?? 0,
      agentCount: snapshot?.agents?.length ?? 0,
      labs: snapshot?.labs || [],
      orders: snapshot?.orders || [],
      collections: snapshot?.collections || [],
      contracts: snapshot?.contracts || [],
      billing: selectedBilling,
      performance: selectedPerformance,
    };
  }, [scope, tab, snapshot, portfolio, selectedBilling, selectedPerformance, effectiveHomeId]);

  usePredatorModuleValidation("Distributor OS", currentUser, predatorSnapshot ?? {}, Boolean(portfolio));

  function selectDistributor(id) {
    const row = distributors.find((d) => d.id === id);
    if (!row || !effectiveHomeId || id === effectiveHomeId) return;
    enterDistributorOs({
      tenantId: id,
      tenantName: row.name,
      homeTenantId: effectiveHomeId,
      tab,
    });
    setOsContext(readDistributorOsContext());
  }

  function changeTab(nextTab) {
    setTab(nextTab);
    if (scope) {
      setDistributorOsContext({
        tenantId: scope.tenantId,
        tenantName: scope.tenantName,
        homeTenantId: scope.homeTenantId,
        tab: nextTab,
      });
      setOsContext(readDistributorOsContext());
    }
  }

  async function handleLifecycleAction(action) {
    if (!scope?.tenantId) return;
    setLifecycleBusy(true);
    setLifecycleMsg("");
    try {
      const result = await applyDistributorLifecycleAction(scope.tenantId, action, {
        tenant: enrichedRow || selectedRow,
      });
      if (!result.ok) {
        setLifecycleMsg(result.error || "Lifecycle action failed");
        return;
      }
      setLifecycleMsg(`${action} applied — status is now ${result.lifecycleStatus}`);
      await loadPortfolio();
      await loadSnapshot();
    } catch (err) {
      setLifecycleMsg(err?.message || "Lifecycle action failed");
    } finally {
      setLifecycleBusy(false);
    }
  }

  function handleCreated(row) {
    setShowCreate(false);
    void loadPortfolio();
    if (row?.id) selectDistributor(row.id);
    setTab("launch");
  }

  const opsBlocked = scope && !scope.canOperate;

  if (loading && !portfolio) return <PageSkeleton rows={8} />;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-indigo-600" />
            Distributor OS
          </h1>
          <p className="text-[11px] text-slate-600">
            Multi-distributor lifecycle, billing, and operations — isolated from PrimeCare HQ
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Distributor
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void loadPortfolio();
              void loadSnapshot();
            }}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {showCreate ? (
        <DistributorCreateWizard onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-xs font-semibold uppercase text-slate-500">Select distributor</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => selectDistributor(e.target.value)}
        >
          <option value="">All distributors (portfolio view)…</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.lifecycleLabel ? ` · ${d.lifecycleLabel}` : ""}
            </option>
          ))}
        </select>
      </section>

      {scope ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-950">
            {distributorOsBannerText(scope.tenantName)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge
              variant={lifecycleStatusVariant(scope.lifecycleStatus)}
              label={lifecycleStatusLabel(scope.lifecycleStatus)}
            />
            <LifecycleActionsPanel
              lifecycleStatus={scope.lifecycleStatus}
              onAction={handleLifecycleAction}
              busy={lifecycleBusy}
            />
          </div>
          {lifecycleMsg ? <p className="text-xs text-slate-600">{lifecycleMsg}</p> : null}
          <OperationRestrictionBanner scope={scope} registryRow={enrichedRow} />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Portfolio view — aggregate metrics across all distributors. Select one to operate.
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {DISTRIBUTOR_OS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => changeTab(t.id)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
              tab === t.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {tab === "dashboard" ? (
          <DashboardPanel
            dashboard={portfolio?.dashboard}
            comparison={portfolio?.comparison}
            onSelect={selectDistributor}
          />
        ) : null}

        {tab === "overview" ? (
          scope ? (
            <div className="space-y-3">
              <PerformancePanel performance={selectedPerformance} billing={selectedBilling} />
              {selectedPerformance?.contractExpiryLabel ? (
                <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {selectedPerformance.contractExpiryLabel}
                </div>
              ) : null}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <p className="font-semibold text-slate-900">Product catalog</p>
                <p className="mt-1 text-slate-700">
                  {catalogReady
                    ? "Using PrimeCare standard catalog."
                    : "Complete Launch checklist to enable catalog."}
                </p>
              </div>
            </div>
          ) : (
            <DashboardPanel
              dashboard={portfolio?.dashboard}
              comparison={portfolio?.comparison}
              onSelect={selectDistributor}
            />
          )
        ) : null}

        {tab === "billing" ? (
          <BillingPanel billingRows={portfolio?.billingRows} onSelect={selectDistributor} />
        ) : null}

        {tab === "launch" ? (
          scope ? (
            <DistributorProvisioningPage
              currentUser={currentUser}
              setActivePage={setActivePage}
              embedded
              lockedDistributorId={scope.tenantId}
              onOsTabNavigate={changeTab}
            />
          ) : (
            <ScopeRequiredMessage tabLabel="Launch" />
          )
        ) : null}

        {tab === "labs" ? (
          scope ? (
            opsBlocked ? (
              <ScopeRequiredMessage tabLabel="Labs (active distributor required)" />
            ) : (
              <LabsPage
                currentUser={currentUser}
                authToken={authToken}
                distributorScope={scope}
                embedded
              />
            )
          ) : (
            <ScopeRequiredMessage tabLabel="Labs" />
          )
        ) : null}

        {tab === "orders" ? (
          scope ? (
            opsBlocked ? (
              <ScopeRequiredMessage tabLabel="Orders (active distributor required)" />
            ) : (
              <OrdersPage currentUser={currentUser} distributorScope={scope} embedded />
            )
          ) : (
            <ScopeRequiredMessage tabLabel="Orders" />
          )
        ) : null}

        {tab === "collections" ? (
          scope ? (
            opsBlocked ? (
              <ScopeRequiredMessage tabLabel="Collections (active distributor required)" />
            ) : (
              <CollectionsPage
                currentUser={currentUser}
                authToken={authToken}
                distributorScope={scope}
                embedded
              />
            )
          ) : (
            <ScopeRequiredMessage tabLabel="Collections" />
          )
        ) : null}

        {tab === "contracts" ? (
          scope ? (
            <LabContractManagementPage
              currentUser={currentUser}
              setActivePage={setActivePage}
              distributorScope={scope}
              embedded
            />
          ) : (
            <ScopeRequiredMessage tabLabel="Contracts" />
          )
        ) : null}

        {tab === "agents" ? (
          scope ? (
            <AgentsPanel agents={snapshot?.agents} tenantName={scope.tenantName} />
          ) : (
            <ScopeRequiredMessage tabLabel="Agents" />
          )
        ) : null}

        {tab === "commissions" ? (
          scope ? (
            <CommissionEnginePage currentUser={currentUser} distributorScope={scope} embedded />
          ) : (
            <ScopeRequiredMessage tabLabel="Commissions" />
          )
        ) : null}

        {tab === "risks" ? (
          scope ? (
            <RisksPanel
              workspace={snapshot?.workspace}
              collections={snapshot?.collections}
              performance={selectedPerformance}
            />
          ) : (
            <ScopeRequiredMessage tabLabel="Risks" />
          )
        ) : null}
      </div>
    </div>
  );
}
