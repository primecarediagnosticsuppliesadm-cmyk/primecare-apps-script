import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { useTenantView } from "@/context/TenantViewContext.jsx";
import { setTenantViewContext } from "@/tenant/tenantFoundationStore.js";
import {
  loadDistributorWorkspaceBundle,
  resolveDistributorWorkspace,
} from "@/distributor/distributorWorkspaceData.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { Briefcase, RefreshCw, AlertTriangle } from "lucide-react";

const TABS = ["Overview", "Labs", "Team", "Pipeline", "Risks"];
const STATUS_VARIANT = { active: "success", pending: "info", suspended: "neutral" };
const HEALTH_VARIANT = { Healthy: "success", Watch: "warning", Risk: "danger" };

function RegistryCard({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={cn(
        "w-full rounded-lg border p-2 text-left text-xs transition sm:hidden",
        selected ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
      )}
    >
      <p className="font-semibold text-slate-900">{row.name}</p>
      <p className="text-slate-500">{row.territorySummary}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
        <span className="tabular-nums text-slate-600">Health {row.healthScore}</span>
      </div>
    </button>
  );
}

function LabCard({ lab }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-900">{lab.labName}</p>
        {lab.riskFlag ? (
          <StatusBadge variant="danger" label="Risk" />
        ) : (
          <StatusBadge variant="success" label="OK" />
        )}
      </div>
      <p className="text-slate-500">Qual: {lab.qualificationStage}</p>
      <p>Outstanding: ₹{Number(lab.outstanding || 0).toLocaleString("en-IN")}</p>
      <p>Last visit: {lab.lastVisit || "—"} · Proof {lab.proofCount}</p>
    </div>
  );
}

export default function DistributorManagementPage({ currentUser = null, setActivePage = null }) {
  const { viewTenantId, homeTenantId, readOnly, setViewTenant } = useTenantView();
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("Overview");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadDistributorWorkspaceBundle(currentUser, { force: true });
      setBundle(data);
    } catch (err) {
      console.error(err);
      setBundle({ registry: [], homeTenantId });
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveId = selectedId || viewTenantId || bundle?.homeTenantId;

  const workspace = useMemo(() => {
    if (!bundle) return null;
    return resolveDistributorWorkspace(bundle, effectiveId, {
      viewTenantId,
      readOnly,
      homeTenantId: bundle.homeTenantId,
    });
  }, [bundle, effectiveId, viewTenantId, readOnly]);

  const predatorSnapshot = useMemo(() => {
    if (!bundle || !workspace) return null;
    return {
      distributorWorkspace: true,
      distributorCount: bundle.registry.length,
      selectedId: workspace.profile.id,
      healthScore: workspace.health.healthScore,
      isLive: workspace.isLive,
      teamGap: workspace.teamGap,
      riskCount: workspace.risks.length,
    };
  }, [bundle, workspace]);

  usePredatorModuleValidation(
    "Distributor Workspace",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  function handleAction(action) {
    if (!action.wired || !setActivePage) return;
    if (action.id === "open_tenant" && workspace?.profile.tenantId) {
      setViewTenant(workspace.profile.tenantId);
      setActivePage("tenantManagement");
      return;
    }
    setActivePage(action.page);
  }

  function selectDistributor(id) {
    setSelectedId(id);
    if (id && homeTenantId) {
      setTenantViewContext(id, homeTenantId);
      setViewTenant(id);
    }
  }

  if (loading) return <PageSkeleton rows={8} />;
  if (!bundle) return null;

  const registry = bundle.registry || [];

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Briefcase className="h-5 w-5 text-indigo-600" />
            Distributor Management
          </h1>
          <p className="text-[11px] text-slate-600">
            Tenant = distributor company · territories are cities within a distributor
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b px-3 py-2 text-xs font-bold uppercase text-slate-500">Distributors</h2>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Territory</th>
                  <th className="px-2 py-1.5">Labs</th>
                  <th className="px-2 py-1.5">Out.</th>
                  <th className="px-2 py-1.5">Health</th>
                </tr>
              </thead>
              <tbody>
                {registry.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
                      effectiveId === row.id && "bg-indigo-50/70"
                    )}
                    onClick={() => selectDistributor(row.id)}
                  >
                    <td className="px-2 py-1.5 font-medium">
                      {row.name}
                      {row.isHome ? <span className="text-indigo-600"> HQ</span> : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                    </td>
                    <td className="max-w-[100px] truncate px-2 py-1.5 text-slate-600">
                      {row.territorySummary}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{row.labs}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      ₹{Number(row.outstanding || 0).toLocaleString("en-IN", { notation: "compact" })}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{row.healthScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 p-2 sm:hidden">
            {registry.map((row) => (
              <RegistryCard
                key={row.id}
                row={row}
                selected={effectiveId === row.id}
                onSelect={selectDistributor}
              />
            ))}
          </div>
        </section>

        {workspace ? (
          <section className="space-y-2">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{workspace.profile.name}</h2>
                  <p className="text-xs text-slate-600">{workspace.profile.territorySummary}</p>
                  <p className="text-[11px] text-slate-500">
                    Owner: {workspace.profile.ownerAdmin}
                    {workspace.profile.registryOnly && !workspace.isLive ? " · Registry snapshot" : null}
                    {workspace.isLive ? " · Live data" : null}
                  </p>
                </div>
                <StatusBadge
                  variant={HEALTH_VARIANT[workspace.health.healthBand] || "neutral"}
                  label={`${workspace.health.healthBand} · ${workspace.health.healthScore}`}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
                <div className="rounded border bg-white px-2 py-1">
                  <p className="text-slate-500">Revenue/mo</p>
                  <p className="font-semibold tabular-nums">
                    {workspace.health.monthlyRevenueLabel ||
                      `₹${Number(workspace.health.monthlyRevenue || 0).toLocaleString("en-IN")}`}
                  </p>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <p className="text-slate-500">Outstanding</p>
                  <p className="font-semibold tabular-nums">
                    {workspace.health.outstandingLabel ||
                      `₹${Number(workspace.health.outstandingReceivables || 0).toLocaleString("en-IN")}`}
                  </p>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <p className="text-slate-500">Coll. efficiency</p>
                  <p className="font-semibold tabular-nums">{workspace.health.collectionEfficiencyPct}%</p>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <p className="text-slate-500">Visits 30d</p>
                  <p className="font-semibold tabular-nums">{workspace.health.visits30d}</p>
                </div>
              </div>
            </div>

            {workspace.risks.length > 0 && tab === "Overview" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                <p className="flex items-center gap-1 font-semibold text-amber-950">
                  <AlertTriangle className="h-3.5 w-3.5" /> Top risk
                </p>
                <p className="text-amber-900">{workspace.risks[0].title}</p>
                <p className="text-amber-800/90">{workspace.risks[0].detail}</p>
              </div>
            ) : null}

            <div className="flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium",
                    tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "Overview" ? (
              <div className="rounded-xl border bg-white p-3 text-xs text-slate-700">
                <dl className="grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Legal name</dt>
                    <dd className="font-medium">{workspace.profile.legalName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Email / phone</dt>
                    <dd>
                      {workspace.profile.email || "—"} · {workspace.profile.phone || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Territories</dt>
                    <dd>{workspace.profile.territories.join(", ") || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment terms</dt>
                    <dd>{workspace.profile.paymentTerms}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Commission</dt>
                    <dd>
                      {workspace.profile.commissionPct != null
                        ? `${workspace.profile.commissionPct}%`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Credit limit</dt>
                    <dd>
                      {workspace.profile.creditLimit
                        ? `₹${workspace.profile.creditLimit.toLocaleString("en-IN")}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {workspace.actions.map((a) => (
                    <Button
                      key={a.id}
                      type="button"
                      size="sm"
                      variant={a.wired ? "outline" : "ghost"}
                      disabled={!a.wired}
                      onClick={() => handleAction(a)}
                    >
                      {a.comingSoon ? `${a.label} (Coming soon)` : a.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "Labs" ? (
              <div className="space-y-2">
                {!workspace.isLive ? (
                  <p className="text-xs text-slate-500">Live lab data requires HQ distributor context.</p>
                ) : workspace.labs.length === 0 ? (
                  <p className="text-xs text-slate-500">No labs in scope — setup gap, not synthetic data.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workspace.labs.map((lab) => (
                      <LabCard key={lab.labId} lab={lab} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "Team" ? (
              <div className="rounded-xl border bg-white p-3 text-xs">
                {workspace.teamGap ? (
                  <p className="font-medium text-amber-800">No agents assigned yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {workspace.team.map((a) => (
                      <li key={a.id} className="rounded border border-slate-100 p-2">
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-slate-600">
                          Visits {a.visits} · Labs {a.labsTouched} · Proof {a.proofCompliancePct}%
                        </p>
                        <StatusBadge variant={a.activityStatus === "Active" ? "success" : "neutral"} label={a.activityStatus} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === "Pipeline" ? (
              <div className="flex flex-wrap gap-2">
                {workspace.pipeline.map((s) => (
                  <div
                    key={s.id}
                    className="min-w-[88px] flex-1 rounded-lg border bg-white px-2 py-2 text-center text-xs"
                  >
                    <p className="font-medium text-slate-600">{s.label}</p>
                    <p className="text-lg font-bold tabular-nums">{s.count}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "Risks" ? (
              <ul className="space-y-2 text-xs">
                {workspace.risks.length === 0 ? (
                  <li className="rounded border bg-white p-3 text-slate-500">No material risks detected.</li>
                ) : (
                  workspace.risks.map((r) => (
                    <li key={r.id} className="rounded-lg border bg-white p-2">
                      <p className="font-semibold text-slate-900">{r.title}</p>
                      <p className="text-slate-600">{r.detail}</p>
                      <p className="mt-1 text-indigo-700">{r.action}</p>
                      {r.wired && setActivePage ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => setActivePage(r.page)}
                        >
                          Go →
                        </Button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-slate-500">Select a distributor to open the workspace.</p>
        )}
      </div>
    </div>
  );
}
