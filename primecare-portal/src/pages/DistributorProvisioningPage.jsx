import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import ProvisioningCreateWizard from "@/components/distributor/ProvisioningCreateWizard.jsx";
import {
  loadProvisioningBundle,
  resolveProvisioningModel,
  activateDistributorProvisioning,
  acknowledgeProvisioningTask,
  refreshProvisioningBundleState,
  updateDistributorAdminDetails,
} from "@/distributor/distributorProvisioningData.js";
import { PROVISIONING_CHECK_ACTIONS } from "@/distributor/distributorProvisioningEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Pencil,
  Bug,
  X,
} from "lucide-react";

const TABS = ["Pipeline", "Readiness", "Tasks", "Timeline"];
const LIFECYCLE_VARIANT = {
  draft: "neutral",
  configuring: "info",
  configured: "info",
  blocked: "danger",
  ready: "success",
  activated: "success",
};
const CHECK_VARIANT = { PASS: "success", WARN: "warning", FAIL: "danger" };

const DIST_STATUS_VARIANT = {
  active: "success",
  pending: "info",
  suspended: "neutral",
};

const TENANT_ISOLATION_FOCUS_KEY = "primecare_tenant_mgmt_section";

function CheckIcon({ status }) {
  if (status === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "FAIL") return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
}

function PipelineStepper({ pipeline }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {pipeline.map((step, i) => (
        <li key={step.id} className="flex min-w-[72px] flex-1 items-center gap-0.5">
          <div
            className={cn(
              "w-full rounded-lg border px-2 py-1.5 text-center text-[10px] font-semibold",
              step.visual === "complete" && "border-emerald-400 bg-emerald-50 text-emerald-900",
              step.visual === "current" && "border-indigo-500 bg-indigo-50 text-indigo-900",
              step.visual === "blocked" && "border-amber-400 bg-amber-50 text-amber-900",
              step.visual === "upcoming" && "border-slate-200 bg-white text-slate-500"
            )}
          >
            {step.label}
          </div>
          {i < pipeline.length - 1 ? (
            <span className="text-slate-300" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function ActivationDiagnosis({ diagnosis }) {
  return (
    <ul className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
      {diagnosis.map((g) => (
        <li key={g.id} className="flex items-center gap-2">
          {g.pass ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : g.comingSoon || !g.blocksActivation ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
          )}
          <span
            className={cn(
              "font-medium",
              g.comingSoon
                ? "text-amber-800"
                : g.pass
                  ? "text-emerald-900"
                  : g.blocksActivation
                    ? "text-red-900"
                    : "text-amber-900"
            )}
          >
            {g.label}
            {g.comingSoon ? (
              <span className="ml-1 font-normal text-amber-700">· Coming Soon</span>
            ) : !g.blocksActivation ? (
              <span className="ml-1 font-normal text-slate-500">(readiness only)</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReadinessDebugDrawer({ debug, onClose }) {
  if (!debug) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Bug className="h-4 w-4 text-indigo-600" />
            Readiness debug
          </h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-indigo-700">{debug.readinessPct}%</p>
        <p className="text-[10px] text-slate-500">
          Last updated:{" "}
          {debug.lastUpdated ? new Date(debug.lastUpdated).toLocaleString() : "—"}
        </p>
        <h4 className="mt-4 text-xs font-bold uppercase text-slate-500">Weights</h4>
        <ul className="mt-1 space-y-1 text-xs">
          {debug.weights.map((w) => (
            <li key={w.id} className="flex justify-between gap-2 rounded border px-2 py-1">
              <span>
                {w.label}
                {w.required ? " · req" : ""}
              </span>
              <span className="tabular-nums text-slate-600">
                {w.earned}/{w.weight} ({w.status})
              </span>
            </li>
          ))}
        </ul>
        <h4 className="mt-4 text-xs font-bold uppercase text-slate-500">Failing checks</h4>
        {debug.failingChecks.length === 0 ? (
          <p className="text-xs text-emerald-700">None — all checks pass or warn only.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {debug.failingChecks.map((c) => (
              <li key={c.id} className="rounded border border-red-100 bg-red-50 px-2 py-1">
                <p className="font-medium text-red-900">{c.label}</p>
                <p className="text-red-800/80">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditAdminModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    name: profile?.admin || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-md rounded-xl bg-white p-4 text-xs shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Pencil className="h-4 w-4" /> Edit distributor admin
        </h3>
        <p className="mt-1 text-slate-500">Required for activation when admin user gate fails.</p>
        <label className="mt-3 block">
          Admin name
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="mt-2 block">
          Admin email
          <input
            type="email"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>
        <label className="mt-2 block">
          Admin phone
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <div className="mt-4 flex gap-2">
          <Button type="submit" size="sm">
            Save & recompute
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function DistributorProvisioningPage({
  currentUser = null,
  setActivePage = null,
}) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("Pipeline");
  const [showWizard, setShowWizard] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showEditAdmin, setShowEditAdmin] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadProvisioningBundle(currentUser, { force: true });
      setBundle(data);
    } catch (err) {
      console.error(err);
      setBundle({ distributors: [], tenants: [], homeTenantId: "" });
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyLocalBundleUpdate = useCallback((distributorId) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const next = refreshProvisioningBundleState(prev);
      if (distributorId) setSelectedId(distributorId);
      return next;
    });
  }, []);

  const model = useMemo(() => {
    if (!bundle) return null;
    const id =
      selectedId ||
      bundle.distributors.find((d) => !d.isHome)?.id ||
      bundle.homeTenantId;
    return resolveProvisioningModel(bundle, id);
  }, [bundle, selectedId]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      distributorProvisioning: true,
      readinessPct: model.readinessPct,
      lifecycle: model.lifecycle,
      canActivate: model.gates.canActivate,
      distributorId: model.distributorId,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Distributor Provisioning",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  function handleOpenAction(action) {
    if (!action) return;
    if (action.type === "edit_admin") {
      setShowEditAdmin(true);
      return;
    }
    if (action.page && setActivePage) {
      if (action.section === "isolation") {
        try {
          sessionStorage.setItem(TENANT_ISOLATION_FOCUS_KEY, "isolation");
        } catch {
          /* ignore */
        }
      }
      setActivePage(action.page);
    }
  }

  function handleSaveAdmin(admin) {
    if (!model) return;
    updateDistributorAdminDetails(model.distributorId, admin);
    setShowEditAdmin(false);
    applyLocalBundleUpdate(model.distributorId);
    setMsg("Admin saved — readiness updated");
  }

  function handleActivate() {
    if (!model || !bundle) return;
    const nextBundle = refreshProvisioningBundleState(bundle);
    const fresh = resolveProvisioningModel(nextBundle, model.distributorId);
    const result = activateDistributorProvisioning(model.distributorId, fresh);
    setBundle(refreshProvisioningBundleState(nextBundle));
    setSelectedId(model.distributorId);
    if (!result.ok) {
      setMsg("Activation blocked — see gate diagnosis below");
      return;
    }
    setMsg("Distributor activated");
  }

  function handleAckTask(taskId) {
    if (!model) return;
    acknowledgeProvisioningTask(model.distributorId, taskId);
    applyLocalBundleUpdate(model.distributorId);
    setMsg("Setup step recorded — readiness updated");
  }

  if (loading) return <PageSkeleton rows={8} />;

  const distributors = bundle?.distributors || [];

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            Provisioning
          </h1>
          <p className="text-[11px] text-slate-600">
            Onboard distributor companies · tenant_id = business entity
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" onClick={() => setShowWizard(true)}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
      </header>

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}
      {showWizard ? (
        <ProvisioningCreateWizard
          onClose={() => setShowWizard(false)}
          onCreated={(row) => {
            setShowWizard(false);
            setBundle((prev) => {
              if (!prev) return prev;
              const tenants = [...(prev.tenants || []), row];
              return refreshProvisioningBundleState({ ...prev, tenants });
            });
            setSelectedId(row.id);
            setMsg("Distributor draft created");
          }}
        />
      ) : null}

      {showEditAdmin && model ? (
        <EditAdminModal
          profile={model.profile}
          onClose={() => setShowEditAdmin(false)}
          onSave={handleSaveAdmin}
        />
      ) : null}

      {showDebug && model ? (
        <ReadinessDebugDrawer debug={model.readinessDebug} onClose={() => setShowDebug(false)} />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border bg-white shadow-sm">
          <h2 className="border-b px-3 py-2 text-xs font-bold uppercase text-slate-500">
            Distributors
          </h2>
          <ul className="max-h-[320px] overflow-y-auto p-2 text-xs">
            {distributors.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "w-full rounded-lg border px-2 py-2 text-left",
                    (selectedId || bundle?.homeTenantId) === d.id
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-100 hover:bg-slate-50"
                  )}
                >
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-slate-500">{d.territorySummary}</p>
                  <StatusBadge
                    variant={DIST_STATUS_VARIANT[d.status] || "neutral"}
                    label={d.status}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {model ? (
          <section className="space-y-2">
            <div className="rounded-xl border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-900">{model.name}</h2>
                  <p className="text-[11px] text-slate-500">
                    {model.territories.join(" · ") || "Set territory in profile"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    onClick={() => setShowDebug(true)}
                  >
                    <Bug className="h-3 w-3" /> Debug
                  </Button>
                  <StatusBadge
                    variant={LIFECYCLE_VARIANT[model.lifecycle] || "neutral"}
                    label={model.lifecycle}
                  />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-indigo-700">
                {model.readinessPct}%{" "}
                <span className="text-sm font-normal text-slate-600">ready</span>
              </p>
              <p
                className={cn(
                  "text-xs font-semibold",
                  model.gates.canActivate ? "text-emerald-700" : "text-red-700"
                )}
              >
                {model.gates.readyLabel}
              </p>
              {!model.gates.canActivate ? (
                <>
                  <p className="mt-1 text-[10px] font-medium uppercase text-slate-500">
                    Activation gates
                  </p>
                  <ActivationDiagnosis diagnosis={model.activationDiagnosis} />
                </>
              ) : null}
              {!model.gates.canActivate &&
              model.checks.find((c) => c.id === "admin_user")?.status !== "PASS" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[10px]"
                  onClick={() => setShowEditAdmin(true)}
                >
                  <Pencil className="h-3 w-3" /> Edit admin
                </Button>
              ) : null}
            </div>

            <div className="flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    tab === t ? "bg-slate-900 text-white" : "bg-slate-100"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "Pipeline" ? (
              <div className="rounded-xl border bg-white p-3">
                <PipelineStepper pipeline={model.pipeline} />
                <p className="mt-2 text-[10px] text-slate-500">
                  Draft → Configured → Ready → Activated. Activation requires admin, product
                  catalog, and isolation only.
                </p>
              </div>
            ) : null}

            {tab === "Readiness" ? (
              <ul className="space-y-1 rounded-xl border bg-white p-3 text-xs">
                {model.checks.map((c) => {
                  const action = PROVISIONING_CHECK_ACTIONS[c.id];
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 py-0.5">
                      <CheckIcon status={c.status} />
                      <span className="min-w-0 flex-1 font-medium">{c.label}</span>
                      <StatusBadge variant={CHECK_VARIANT[c.status]} label={c.status} />
                      {action ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          disabled={action.comingSoon}
                          onClick={() => handleOpenAction(action)}
                        >
                          {action.label}
                          {!action.comingSoon ? (
                            <ArrowRight className="ml-0.5 h-3 w-3" />
                          ) : null}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {tab === "Tasks" ? (
              <ul className="space-y-1 rounded-xl border bg-white p-3 text-xs">
                {model.tasks
                  .filter((t) => t.id !== "activate")
                  .map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-1">
                      <span className={t.done ? "text-emerald-600" : "text-slate-400"}>
                        {t.done ? "☑" : "□"}
                      </span>
                      <span className={cn("min-w-0 flex-1", t.done && "line-through text-slate-500")}>
                        {t.label}
                      </span>
                      {t.action ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          disabled={t.comingSoon || t.action.comingSoon}
                          onClick={() => handleOpenAction(t.action)}
                        >
                          {t.action.label}
                          {!t.comingSoon && !t.action.comingSoon ? (
                            <ArrowRight className="ml-0.5 h-3 w-3" />
                          ) : null}
                        </Button>
                      ) : null}
                      {!t.done && t.canMarkProvisioned ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => handleAckTask(t.id)}
                        >
                          Mark provisioned
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : null}

            {tab === "Timeline" ? (
              <ul className="rounded-xl border bg-white p-3 text-xs">
                {model.timeline.length === 0 ? (
                  <li className="text-slate-500">No timeline events yet.</li>
                ) : (
                  model.timeline.map((e) => (
                    <li key={e.id} className="border-b border-slate-100 py-1.5 last:border-0">
                      <p className="font-medium">{e.label}</p>
                      <p className="text-slate-500">
                        {e.at ? new Date(e.at).toLocaleString() : "—"}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!model.gates.canActivate || model.activated}
                onClick={handleActivate}
              >
                Activate distributor
              </Button>
              {model.activated && setActivePage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setActivePage("distributorManagement")}
                >
                  Open Distributor Workspace
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              ) : null}
            </div>
          </section>
        ) : (
          <p className="text-sm text-slate-500">Select a distributor to provision.</p>
        )}
      </div>
    </div>
  );
}
