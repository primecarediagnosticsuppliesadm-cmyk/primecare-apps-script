import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import DistributorCatalogPage from "@/pages/DistributorCatalogPage.jsx";
import { loadDistributorCatalogBundle } from "@/catalog/distributorCatalogData.js";
import { catalogAssignedCount, isCatalogAssigned } from "@/catalog/distributorCatalogEngine.js";
import DistributorCreateWizard from "@/components/distributor/DistributorCreateWizard.jsx";
import {
  BillingPanel,
  DashboardPanel,
  DistributorBillingDetailPanel,
  DistributorStageProgressBar,
  LifecycleActionsPanel,
  OperationRestrictionBanner,
} from "@/components/distributor/DistributorOsV2Panels.jsx";
import { buildDistributorProfitabilityModel, findProfitabilityRow } from "@/founder/distributorProfitabilityEngine.js";
import { loadFounderCommissionMetrics } from "@/commission/commissionData.js";
import { cn } from "@/lib/utils";
import { Building2, Plus, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { ROLES } from "@/config/roles";

const DEBUG_DISTRIBUTOR_OS = import.meta.env.DEV;

function logDistributorOsTiming(label, detail = {}) {
  if (!DEBUG_DISTRIBUTOR_OS) return;
  console.debug(`[DistributorOs:timing] ${label}`, { at: performance.now().toFixed(1), ...detail });
}

function AgentsPanel({ agents = [], tenantName = "", territory = "", collectionsCount = 0, labCount = 0 }) {
  if (!agents.length) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-600">
          Operational agent records for {tenantName || "this distributor"} — HQ-managed, no distributor login.
        </p>
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No agents registered yet. Add agents from HQ when field coverage is ready.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        Operational records only — PrimeCare HQ manages agents. No user provisioning or authentication.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">Territory</th>
              <th className="px-2 py-1.5">Phone</th>
              <th className="px-2 py-1.5">Labs assigned</th>
              <th className="px-2 py-1.5">Collections managed</th>
              <th className="px-2 py-1.5">Performance</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.user_id} className="border-b border-slate-100">
                <td className="px-2 py-1.5 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    {a.agent_name || "Agent"}
                  </span>
                </td>
                <td className="px-2 py-1.5">{a.territory || territory || "—"}</td>
                <td className="px-2 py-1.5">{a.phone || "—"}</td>
                <td className="px-2 py-1.5 tabular-nums">{a.labs_assigned ?? labCount ?? "—"}</td>
                <td className="px-2 py-1.5 tabular-nums">{a.collections_managed ?? collectionsCount ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge
                    variant={a.active === false ? "neutral" : "success"}
                    label={a.active === false ? "Inactive" : "Active"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function LabsTabAccessMessage({ scope, distributorName = "" }) {
  if (!scope) {
    return <ScopeRequiredMessage tabLabel="Labs" />;
  }
  if (!scope.canOperate) {
    const name = distributorName || scope.tenantName || "This distributor";
    const status = lifecycleStatusLabel(scope.lifecycleStatus);
    return (
      <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {name} is {status}. Activate the distributor before adding labs.
      </p>
    );
  }
  return null;
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
  const [tab, setTab] = useState(() => {
    const preset = readDistributorOsContext()?.tab || "dashboard";
    return preset === "overview" ? "dashboard" : preset;
  });
  const [snapshot, setSnapshot] = useState(null);
  const [catalogBundle, setCatalogBundle] = useState(null);
  const [catalogMirrorHealth, setCatalogMirrorHealth] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleMsg, setLifecycleMsg] = useState("");
  const [billingPayments, setBillingPayments] = useState([]);
  const [commissionByDistributor, setCommissionByDistributor] = useState({});

  const effectiveHomeId = homeTenantId || currentUser?.tenantId || "";
  const registry = portfolio?.distributors || [];
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const distributors = useMemo(() => {
    if (currentUser?.role === ROLES.ADMIN && currentUser?.tenantId) {
      const own = registry.find((r) => r.id === currentUser.tenantId);
      return own && !own.isHome ? [own] : [];
    }
    return filterDistributorRegistry(registry, effectiveHomeId);
  }, [registry, effectiveHomeId, currentUser]);

  const selectedId = osContext?.tenantId || "";
  const selectedRow = useMemo(
    () => distributors.find((d) => d.id === selectedId) || null,
    [distributors, selectedId]
  );
  const enrichedRow = useMemo(
    () => (selectedRow ? enrichRegistryRowLifecycle(selectedRow) : null),
    [selectedRow]
  );
  const selectedName =
    osContext?.tenantName || selectedRow?.name || selectedRow?.config?.companyName || "";

  useEffect(() => {
    logDistributorOsTiming("render", {
      count: renderCountRef.current,
      selectedId,
      tab,
    });
  });

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

  useEffect(() => {
    if (!portfolio?.distributors?.length) {
      setCommissionByDistributor({});
      return;
    }
    const ids = portfolio.distributors.map((d) => d.id).filter(Boolean);
    void loadFounderCommissionMetrics(ids, { homeTenantId: effectiveHomeId })
      .then((res) => setCommissionByDistributor(res.ok ? res.byDistributor || {} : {}))
      .catch(() => setCommissionByDistributor({}));
  }, [portfolio?.distributors, effectiveHomeId]);

  const profitabilitySnapshot = useMemo(() => {
    if (!scope || !portfolio || !selectedId) return null;
    const model = buildDistributorProfitabilityModel({
      distributors: portfolio.distributors.filter((d) => d.id === selectedId),
      performanceRows: portfolio.performanceRows || [],
      billingRows: portfolio.billingRows || [],
      commissionByDistributor,
    });
    return findProfitabilityRow(model, selectedId);
  }, [scope, portfolio, selectedId, commissionByDistributor]);

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
    if (!selectedId) {
      setSnapshot(null);
      return;
    }
    const started = performance.now();
    logDistributorOsTiming("loadSnapshot:start", { selectedId });
    try {
      const data = await loadDistributorOsSnapshot(currentUser, selectedId);
      setSnapshot(data);
      logDistributorOsTiming("loadSnapshot:done", {
        selectedId,
        ms: (performance.now() - started).toFixed(1),
      });
    } catch (err) {
      console.warn("[DistributorOs] snapshot", err);
      setSnapshot(null);
    }
  }, [currentUser, selectedId]);

  const loadCatalogSummary = useCallback(async () => {
    if (!selectedId) {
      setCatalogBundle(null);
      return;
    }
    const started = performance.now();
    logDistributorOsTiming("loadCatalogSummary:start", { selectedId });
    try {
      const catalog = await loadDistributorCatalogBundle(selectedId, effectiveHomeId);
      setCatalogBundle(catalog);
      logDistributorOsTiming("loadCatalogSummary:done", {
        selectedId,
        ms: (performance.now() - started).toFixed(1),
      });
    } catch (err) {
      console.warn("[DistributorOs] catalog summary", err);
      setCatalogBundle(null);
    }
  }, [selectedId, effectiveHomeId]);

  const handleCatalogChanged = useCallback(
    async (result) => {
      logDistributorOsTiming("catalogChanged", { selectedId, assignedCount: result?.assignedCount });
      if (result?.catalogMirrorHealth) {
        setCatalogMirrorHealth(result.catalogMirrorHealth);
      }
      if (result?.config || result?.items) {
        setCatalogBundle((prev) => ({
          ...(prev || {}),
          catalogAssigned:
            result.catalogAssigned ?? isCatalogAssigned(result.config || {}),
          assignedCount: result.assignedCount ?? catalogAssignedCount(result.config || {}),
          assignedItems: result.items || prev?.assignedItems || [],
          pricingValid: result.pricingValid ?? prev?.pricingValid,
          hqPricingValid: result.hqPricingValid ?? prev?.hqPricingValid,
          hqPricingMissingCount: result.hqPricingMissingCount ?? prev?.hqPricingMissingCount,
          inventoryIsolated: result.inventoryIsolated ?? prev?.inventoryIsolated,
          hqLeakCount: result.hqLeakCount ?? prev?.hqLeakCount,
        }));
      } else {
        await loadCatalogSummary();
      }
      void loadSnapshot();
    },
    [selectedId, loadCatalogSummary, loadSnapshot]
  );

  useEffect(() => {
    const presetTab = consumeDistributorOsTabPreset();
    if (presetTab) setTab(presetTab === "overview" ? "dashboard" : presetTab);
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (tab === "catalog") return;
    void loadCatalogSummary();
  }, [loadCatalogSummary, tab]);

  useEffect(() => {
    if (!selectedId || !effectiveHomeId) return;
    if (selectedId === effectiveHomeId) return;
    const ctx = readDistributorOsContext();
    if (
      ctx?.tenantId === selectedId &&
      ctx?.homeTenantId === effectiveHomeId &&
      ctx?.tab === tab &&
      ctx?.tenantName === selectedName
    ) {
      return;
    }
    enterDistributorOs({
      tenantId: selectedId,
      tenantName: selectedName,
      homeTenantId: effectiveHomeId,
      tab,
    });
    setOsContext(readDistributorOsContext());
  }, [selectedId, selectedName, effectiveHomeId, tab]);

  const catalogAssigned =
    Boolean(catalogBundle?.catalogAssigned) ||
    isCatalogAssigned(enrichedRow?.config || selectedRow?.config || {});

  const predatorSnapshot = useMemo(() => {
    const base = {
      distributorOs: true,
      distributorOsV2: true,
      homeTenantId: effectiveHomeId,
      globalViewTenantId: effectiveHomeId,
      tab,
      portfolio: portfolio?.dashboard || null,
      billingRows: portfolio?.billingRows || [],
      billingLedgerLoadOk: portfolio?.billingLedgerLoadOk ?? true,
      billingLedgerLoadError: portfolio?.billingLedgerLoadError ?? null,
      performanceRows: portfolio?.performanceRows || [],
      comparison: portfolio?.comparison || [],
      hqLeakCount: portfolio?.hqLeakCount ?? 0,
      totalRevenue: portfolio?.totalRevenue ?? 0,
      commissionsReadOnly: tab === "commissions",
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
      contractCount:
        snapshot?.contractNonTerminatedCount ?? snapshot?.contracts?.length ?? 0,
      contractNonTerminatedCount: snapshot?.contractNonTerminatedCount ?? 0,
      agentCount: snapshot?.agents?.length ?? 0,
      labs: snapshot?.labs || [],
      orders: snapshot?.orders || [],
      collections: snapshot?.collections || [],
      contracts: snapshot?.contracts || [],
      billing: selectedBilling,
      performance: selectedPerformance,
      catalogAssigned: catalogBundle?.catalogAssigned ?? catalogAssigned,
      catalogAssignedCount: catalogBundle?.assignedCount ?? 0,
      catalogPricingValid: catalogBundle?.pricingValid ?? true,
      catalogHqPricingValid: catalogBundle?.hqPricingValid ?? true,
      catalogHqPricingMissingCount: catalogBundle?.hqPricingMissingCount ?? 0,
      catalogInventoryIsolated: catalogBundle?.inventoryIsolated ?? true,
      catalogHqLeakCount: catalogBundle?.hqLeakCount ?? 0,
      catalogItems: catalogBundle?.assignedItems || [],
      catalogMirrorHealth: catalogMirrorHealth || null,
    };
  }, [
    scope,
    tab,
    snapshot,
    portfolio,
    selectedBilling,
    selectedPerformance,
    effectiveHomeId,
    catalogBundle,
    catalogAssigned,
    catalogMirrorHealth,
  ]);

  const billingPredatorSnapshot = useMemo(() => {
    if (tab !== "billing" || !portfolio) return null;
    const paymentSum = billingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      billingTabActive: true,
      scopeTenantId: scope?.tenantId || null,
      isExecutive: currentUser?.role === ROLES.EXECUTIVE,
      hasRecordPaymentUi: Boolean(scope && currentUser?.role === ROLES.EXECUTIVE),
      billingPaymentHistoryCount: billingPayments.length,
      billingPaymentHistorySum: paymentSum,
      billingCollected: selectedBilling?.collected ?? null,
      billingOutstanding: selectedBilling?.outstanding ?? null,
      billingLedgerCount: selectedBilling?.billingLedgerCount ?? 0,
      billingCollectedSource: selectedBilling?.collectedSource ?? null,
      billingLastPaymentDate: selectedBilling?.lastPaymentDate ?? null,
      dashboardBillingRollup: portfolio?.dashboard?.billingRollup || null,
      billingLedgerLoadOk: portfolio?.billingLedgerLoadOk ?? true,
    };
  }, [tab, portfolio, scope, billingPayments, selectedBilling, currentUser]);

  usePredatorModuleValidation("Distributor OS", currentUser, predatorSnapshot ?? {}, Boolean(portfolio));
  usePredatorModuleValidation(
    "Distributor Billing",
    currentUser,
    billingPredatorSnapshot ?? {},
    Boolean(billingPredatorSnapshot)
  );

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
      await loadCatalogSummary();
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
              void loadCatalogSummary();
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
          <DistributorStageProgressBar
            distributorRow={enrichedRow || selectedRow}
            catalogBundle={catalogBundle}
            snapshot={snapshot}
            onNavigateTab={changeTab}
          />
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
            profitabilitySnapshot={profitabilitySnapshot}
          />
        ) : null}

        {tab === "billing" ? (
          <div className="space-y-4">
            {scope ? (
              <DistributorBillingDetailPanel
                scope={scope}
                billing={selectedBilling}
                currentUser={currentUser}
                homeTenantId={effectiveHomeId}
                onPaymentRecorded={loadPortfolio}
                onPaymentsChange={setBillingPayments}
              />
            ) : (
              <ScopeRequiredMessage tabLabel="Billing (record payment)" />
            )}
            <BillingPanel billingRows={portfolio?.billingRows} onSelect={selectDistributor} />
          </div>
        ) : null}

        {tab === "catalog" ? (
          scope ? (
            <DistributorCatalogPage
              currentUser={currentUser}
              distributorScope={scope}
              selectedDistributorTenantId={scope.tenantId}
              distributorRow={enrichedRow || selectedRow}
              onCatalogChanged={handleCatalogChanged}
              embedded
            />
          ) : (
            <ScopeRequiredMessage tabLabel="Catalog" />
          )
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
          scope?.canOperate ? (
            <LabsPage
              currentUser={currentUser}
              authToken={authToken}
              distributorScope={scope}
              embedded
            />
          ) : (
            <LabsTabAccessMessage scope={scope} distributorName={selectedName} />
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
            <AgentsPanel
              agents={snapshot?.agents}
              tenantName={scope.tenantName}
              territory={enrichedRow?.territorySummary}
              collectionsCount={snapshot?.collections?.length}
              labCount={snapshot?.labs?.length}
            />
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
