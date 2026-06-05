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
import {
  enterDistributorOs,
  readDistributorOsContext,
  setDistributorOsContext,
} from "@/tenant/tenantFoundationStore.js";
import { loadDistributorWorkspaceBundle } from "@/distributor/distributorWorkspaceData.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import LabsPage from "@/pages/LabsPage.jsx";
import OrdersPage from "@/pages/OrdersPage.jsx";
import CollectionsPage from "@/pages/CollectionsPage.jsx";
import LabContractManagementPage from "@/pages/LabContractManagementPage.jsx";
import CommissionEnginePage from "@/pages/CommissionEnginePage.jsx";
import { cn } from "@/lib/utils";
import { Building2, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { ROLES } from "@/config/roles";

const HEALTH_VARIANT = { Healthy: "success", Watch: "warning", Risk: "danger" };

function OverviewPanel({ workspace, snapshot, launchStatus = null, catalogReady = false }) {
  if (!workspace) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Select a distributor to view overview.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{workspace.profile.name}</h2>
            <p className="text-xs text-slate-600">{workspace.profile.territorySummary}</p>
            <p className="text-[11px] text-slate-500">
              Tenant ID: {workspace.profile.tenantId}
              {workspace.isLive ? " · Live data" : " · Cross-tenant read"}
            </p>
          </div>
          <StatusBadge
            variant={HEALTH_VARIANT[workspace.health.healthBand] || "neutral"}
            label={`${workspace.health.healthBand} · ${workspace.health.healthScore}`}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
          <div className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">Labs</p>
            <p className="font-semibold tabular-nums">{snapshot?.labs?.length ?? workspace.profile.labs ?? 0}</p>
          </div>
          <div className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">Orders</p>
            <p className="font-semibold tabular-nums">{snapshot?.orders?.length ?? 0}</p>
          </div>
          <div className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">Collections</p>
            <p className="font-semibold tabular-nums">{snapshot?.collections?.length ?? 0}</p>
          </div>
          <div className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">Contracts</p>
            <p className="font-semibold tabular-nums">{snapshot?.contracts?.length ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Product catalog</p>
        <p className="mt-1">
          {catalogReady
            ? "Using PrimeCare standard catalog (shared HQ inventory)."
            : "Standard catalog not enabled — complete Launch Distributor checklist."}
        </p>
      </div>

      {launchStatus ? (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs">
          <p className="font-semibold text-indigo-950">Launch status</p>
          <p className="text-indigo-900">
            {launchStatus.activated
              ? "Distributor activated"
              : `${launchStatus.readyCount || 0}/${launchStatus.totalChecks || 0} launch checks ready`}
          </p>
        </div>
      ) : null}

      {workspace.risks?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <p className="flex items-center gap-1 font-semibold text-amber-950">
            <AlertTriangle className="h-3.5 w-3.5" /> Active risks
          </p>
          <ul className="mt-1 list-disc pl-4 text-amber-900">
            {workspace.risks.slice(0, 3).map((r) => (
              <li key={r.id || r.title}>{r.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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

function RisksPanel({ workspace, collections = [] }) {
  const workspaceRisks = workspace?.risks || [];
  const creditRisks = collections.filter(
    (c) =>
      String(c.riskStatus || "").toLowerCase() === "high" ||
      String(c.creditHold || "").toUpperCase() === "HOLD"
  );

  if (!workspaceRisks.length && !creditRisks.length) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        No elevated risks detected for this distributor.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {workspaceRisks.map((r) => (
        <div key={r.id || r.title} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <p className="font-semibold text-amber-950">{r.title}</p>
          <p className="text-amber-900">{r.detail || r.description}</p>
        </div>
      ))}
      {creditRisks.map((c) => (
        <div
          key={c.labId}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs"
        >
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

export default function DistributorOsPage({
  currentUser = null,
  setActivePage = null,
  authToken = null,
}) {
  const homeTenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState([]);
  const [osContext, setOsContext] = useState(() => readDistributorOsContext());
  const [tab, setTab] = useState(() => readDistributorOsContext()?.tab || "overview");
  const [snapshot, setSnapshot] = useState(null);

  const effectiveHomeId = homeTenantId || currentUser?.tenantId || "";

  const distributors = useMemo(() => {
    if (currentUser?.role === ROLES.ADMIN && currentUser?.tenantId) {
      const own = registry.find((r) => r.id === currentUser.tenantId);
      return own && !own.isHome ? [own] : [];
    }
    return filterDistributorRegistry(registry, effectiveHomeId);
  }, [registry, effectiveHomeId, currentUser]);

  const selectedId = osContext?.tenantId || distributors[0]?.id || "";
  const selectedRow = distributors.find((d) => d.id === selectedId) || null;
  const selectedName =
    osContext?.tenantName || selectedRow?.name || selectedRow?.config?.companyName || "";

  const scope = useMemo(() => {
    if (!isValidDistributorOsScope({ tenantId: selectedId }, effectiveHomeId)) return null;
    return buildDistributorOsScope({
      tenantId: selectedId,
      tenantName: selectedName,
      homeTenantId: effectiveHomeId,
    });
  }, [selectedId, selectedName, effectiveHomeId]);

  const loadRegistry = useCallback(async () => {
    try {
      setLoading(true);
      const bundle = await loadDistributorWorkspaceBundle(currentUser, { force: true });
      setRegistry(bundle.registry || []);
    } catch (err) {
      console.error(err);
      setRegistry([]);
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
    void loadRegistry();
  }, [loadRegistry]);

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

  const registryRow = selectedRow || registry.find((r) => r.id === selectedId);
  const catalogReady = Boolean(registryRow?.config?.productCatalogReady);

  const predatorSnapshot = useMemo(() => {
    if (!scope) return null;
    return {
      distributorOs: true,
      scopeTenantId: scope.tenantId,
      scopeTenantName: scope.tenantName,
      homeTenantId: scope.homeTenantId,
      globalViewTenantId: scope.homeTenantId,
      tab,
      labCount: snapshot?.labs?.length ?? 0,
      orderCount: snapshot?.orders?.length ?? 0,
      collectionCount: snapshot?.collections?.length ?? 0,
      contractCount: snapshot?.contracts?.length ?? 0,
      agentCount: snapshot?.agents?.length ?? 0,
      labs: snapshot?.labs || [],
      orders: snapshot?.orders || [],
      collections: snapshot?.collections || [],
      contracts: snapshot?.contracts || [],
    };
  }, [scope, tab, snapshot]);

  const launchStatus = useMemo(() => {
    if (!registryRow) return null;
    const checks = registryRow.launchChecksReady;
    return {
      activated: String(registryRow.status).toLowerCase() === "active",
      readyCount: Number(registryRow.launchReadyCount || checks || 0),
      totalChecks: Number(registryRow.launchCheckTotal || 5),
    };
  }, [registryRow]);

  usePredatorModuleValidation(
    "Distributor OS",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
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

  if (loading) return <PageSkeleton rows={8} />;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-indigo-600" />
            Distributor OS
          </h1>
          <p className="text-[11px] text-slate-600">
            Distributor operations isolated from PrimeCare HQ
          </p>
        </div>
        <div className="flex gap-2">
          {setActivePage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setActivePage("distributorManagement")}
            >
              Distributor Management
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void loadRegistry();
              void loadSnapshot();
            }}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-xs font-semibold uppercase text-slate-500">Select distributor</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => selectDistributor(e.target.value)}
        >
          <option value="">Choose distributor…</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </section>

      {scope ? (
        <div className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-950">
          {distributorOsBannerText(scope.tenantName)}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select a distributor tenant to enter Distributor OS. HQ operations stay in Labs / Orders /
          Inventory menus.
        </div>
      )}

      {scope ? (
        <>
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
            {tab === "overview" ? (
              <OverviewPanel
                workspace={snapshot?.workspace}
                snapshot={snapshot}
                launchStatus={launchStatus}
                catalogReady={catalogReady}
              />
            ) : null}
            {tab === "labs" ? (
              <LabsPage
                currentUser={currentUser}
                authToken={authToken}
                distributorScope={scope}
                embedded
              />
            ) : null}
            {tab === "orders" ? (
              <OrdersPage
                currentUser={currentUser}
                distributorScope={scope}
                embedded
              />
            ) : null}
            {tab === "collections" ? (
              <CollectionsPage
                currentUser={currentUser}
                authToken={authToken}
                distributorScope={scope}
                embedded
              />
            ) : null}
            {tab === "contracts" ? (
              <LabContractManagementPage
                currentUser={currentUser}
                setActivePage={setActivePage}
                distributorScope={scope}
                embedded
              />
            ) : null}
            {tab === "agents" ? (
              <AgentsPanel agents={snapshot?.agents} tenantName={scope.tenantName} />
            ) : null}
            {tab === "commissions" ? (
              <CommissionEnginePage currentUser={currentUser} distributorScope={scope} embedded />
            ) : null}
            {tab === "risks" ? (
              <RisksPanel workspace={snapshot?.workspace} collections={snapshot?.collections} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
