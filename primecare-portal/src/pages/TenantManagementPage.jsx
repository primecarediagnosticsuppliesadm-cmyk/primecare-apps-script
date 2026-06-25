import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import TenantCreationWizard from "@/components/tenant/TenantCreationWizard.jsx";
import TenantSwitcher from "@/components/tenant/TenantSwitcher.jsx";
import { useTenantView } from "@/context/TenantViewContext.jsx";
import {
  loadTenantFoundationRegistry,
  activateRegistryTenant,
} from "@/tenant/tenantFoundationData.js";
import { runTenantFoundationIsolationChecks } from "@/tenant/tenantFoundationIsolation.js";
import { upsertRegistryTenant, getRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  Building2,
  Plus,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

const HEALTH_VARIANT = { Healthy: "success", Watch: "warning", Risk: "danger" };
const STATUS_VARIANT = { ACTIVE: "success", INACTIVE: "neutral", PENDING: "info" };

function IsolationBadge({ status }) {
  if (status === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "FAIL") return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
}

export default function TenantManagementPage({ currentUser = null }) {
  const { viewTenantId, readOnly, homeTenantId, syncFromStorage } = useTenantView();
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isolationRunning, setIsolationRunning] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const load = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      const data = await loadTenantFoundationRegistry(currentUser, {
        force: options.force === true,
      });
      setRegistry(data);
      syncFromStorage();
    } catch (err) {
      console.error(err);
      setRegistry({ tenants: [], switcherOptions: [], homeTenantId });
    } finally {
      setLoading(false);
    }
  }, [currentUser, homeTenantId, syncFromStorage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const focus = sessionStorage.getItem("primecare_tenant_mgmt_section");
      if (focus === "isolation") {
        sessionStorage.removeItem("primecare_tenant_mgmt_section");
        requestAnimationFrame(() => {
          document.getElementById("tenant-isolation-panel")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    } catch {
      /* ignore */
    }
  }, [loading]);

  const displayTenant = useMemo(() => {
    const list = registry?.tenants || [];
    const id = selectedId || viewTenantId || homeTenantId;
    return list.find((t) => t.id === id) || list[0] || null;
  }, [registry, selectedId, viewTenantId, homeTenantId]);

  const predatorSnapshot = useMemo(() => {
    if (!registry) return null;
    return {
      tenantFoundation: true,
      tenantCount: registry.tenants.length,
      homeTenantId: registry.homeTenantId,
      pendingCount: registry.tenants.filter((t) => t.status === "PENDING").length,
    };
  }, [registry]);

  usePredatorModuleValidation(
    "Tenant Foundation",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  async function rerunIsolation() {
    if (!homeTenantId || readOnly) return;
    setIsolationRunning(true);
    try {
      const checks = await runTenantFoundationIsolationChecks(homeTenantId);
      const pass = checks.every((c) => c.status === "PASS");
      const row = getRegistryTenant(homeTenantId) || { id: homeTenantId, name: "PrimeCare HQ" };
      upsertRegistryTenant({
        ...row,
        isolationChecks: checks,
        lastIsolationPass: pass,
        lastIsolationAt: new Date().toISOString(),
      });
      await load();
      setActionMsg(pass ? "Isolation PASS" : "Isolation issues detected");
    } finally {
      setIsolationRunning(false);
    }
  }

  function handleActivate(tenant) {
    if (readOnly) return;
    const result = activateRegistryTenant(tenant.id);
    if (!result.ok) {
      setActionMsg(result.error || "Cannot activate");
      return;
    }
    setActionMsg(`${tenant.name} activated`);
    void load();
  }

  if (loading) return <PageSkeleton rows={10} />;

  const tenants = registry?.tenants || [];

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-indigo-600" />
            Tenant Management
          </h1>
          <p className="text-xs text-slate-600">Multi-distributor registry · no impersonation</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TenantSwitcher options={registry?.switcherOptions || []} />
          <Button type="button" variant="ghost" size="icon" onClick={() => void load({ force: true })} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!readOnly ? (
            <Button type="button" size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4" /> New tenant
            </Button>
          ) : null}
        </div>
      </header>

      {readOnly ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Read-only view for <strong>{displayTenant?.name || viewTenantId}</strong>. Switch to PrimeCare HQ to
          edit or run live isolation probes.
        </div>
      ) : null}

      {actionMsg ? (
        <p className="text-xs text-slate-600">{actionMsg}</p>
      ) : null}

      {showWizard && !readOnly ? (
        <TenantCreationWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            void load();
          }}
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b px-3 py-2 text-xs font-bold uppercase text-slate-500">Tenant registry</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">Tenant</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">Admin</th>
                <th className="px-2 py-2">Labs</th>
                <th className="px-2 py-2">Orders</th>
                <th className="px-2 py-2">Collections</th>
                <th className="px-2 py-2">Health</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  className={cn(
                    "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
                    displayTenant?.id === t.id && "bg-indigo-50/60"
                  )}
                  onClick={() => setSelectedId(t.id)}
                >
                  <td className="px-2 py-2 font-medium">
                    {t.name}
                    {t.isHome ? <span className="ml-1 text-[10px] text-indigo-600">HQ</span> : null}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge variant={STATUS_VARIANT[t.status] || "neutral"} label={t.status} />
                  </td>
                  <td className="px-2 py-2 text-slate-500">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-2 py-2">{t.adminUser}</td>
                  <td className="px-2 py-2 tabular-nums">{t.metrics.labs}</td>
                  <td className="px-2 py-2 tabular-nums">{t.metrics.orders}</td>
                  <td className="px-2 py-2 tabular-nums">{t.metrics.collections}</td>
                  <td className="px-2 py-2">
                    <StatusBadge variant={HEALTH_VARIANT[t.healthBand] || "neutral"} label={t.healthBand} />
                    <span className="ml-1 tabular-nums text-slate-500">{t.healthScore}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tenants.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">No tenants in registry. Create one or connect Supabase.</p>
        ) : null}
      </section>

      {displayTenant ? (
        <>
          <section
            id="tenant-isolation-panel"
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
          >
            <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Tenant isolation
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              {(displayTenant.isolationChecks || []).map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded border bg-white px-2 py-1.5 text-xs">
                  <IsolationBadge status={c.status} />
                  <span className="font-medium">{c.label}</span>
                  <span className="ml-auto text-slate-500">{c.status}</span>
                </li>
              ))}
            </ul>
            {!readOnly && displayTenant.isHome ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={isolationRunning}
                onClick={() => void rerunIsolation()}
              >
                Re-run isolation (HQ)
              </Button>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-bold uppercase text-slate-600">Tenant readiness</h2>
            <p className="text-sm font-semibold text-slate-800">{displayTenant.name}</p>
            <ul className="mt-2 space-y-1 text-xs">
              {displayTenant.readiness.checks.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  {c.pass ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  {c.label}
                </li>
              ))}
            </ul>
            {displayTenant.status === "PENDING" && !readOnly ? (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={!displayTenant.readiness.canActivate}
                onClick={() => handleActivate(displayTenant)}
              >
                Activate tenant
              </Button>
            ) : null}
            {displayTenant.status === "PENDING" && !displayTenant.readiness.ready ? (
              <p className="mt-2 text-[10px] text-slate-500">
                Complete admin, roles, catalog, lab, and isolation before activation.
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <h2 className="font-bold uppercase text-slate-600">Operational snapshot</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>Labs: {displayTenant.metrics.labs}</div>
              <div>Orders: {displayTenant.metrics.orders}</div>
              <div>Collections: {displayTenant.metrics.collections}</div>
              <div>Visits (30d): {displayTenant.metrics.visits}</div>
              <div>Interventions: {displayTenant.metrics.openInterventions}</div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
