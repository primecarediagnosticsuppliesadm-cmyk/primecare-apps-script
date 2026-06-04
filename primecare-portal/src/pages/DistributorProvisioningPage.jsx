import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import ProvisioningCreateWizard from "@/components/distributor/ProvisioningCreateWizard.jsx";
import {
  loadProvisioningBundle,
  resolveProvisioningModel,
  activateDistributorProvisioning,
  acknowledgeProvisioningTask,
} from "@/distributor/distributorProvisioningData.js";
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

export default function DistributorProvisioningPage({
  currentUser = null,
  setActivePage = null,
}) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("Pipeline");
  const [showWizard, setShowWizard] = useState(false);
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

  const model = useMemo(() => {
    if (!bundle) return null;
    const id = selectedId || bundle.distributors.find((d) => !d.isHome)?.id || bundle.homeTenantId;
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

  function handleActivate() {
    if (!model) return;
    const result = activateDistributorProvisioning(model.distributorId, model);
    if (!result.ok) {
      setMsg(`Blocked: ${(result.blockers || [result.error]).join(", ")}`);
      return;
    }
    setMsg("Distributor activated");
    void load();
  }

  function handleAckTask(taskId) {
    if (!model) return;
    acknowledgeProvisioningTask(model.distributorId, taskId);
    setMsg("Setup step recorded");
    void load();
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
            setSelectedId(row.id);
            void load();
          }}
        />
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
                <StatusBadge
                  variant={LIFECYCLE_VARIANT[model.lifecycle] || "neutral"}
                  label={model.lifecycle}
                />
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
                {!model.gates.canActivate && model.gates.blockers.length
                  ? ` — ${model.gates.blockers.map((b) => b.label).join(", ")}`
                  : null}
              </p>
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
                  Draft → Configured → Ready → Activated. Blocked when required gates fail.
                </p>
              </div>
            ) : null}

            {tab === "Readiness" ? (
              <ul className="space-y-1 rounded-xl border bg-white p-3 text-xs">
                {model.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <CheckIcon status={c.status} />
                    <span className="flex-1 font-medium">{c.label}</span>
                    <StatusBadge variant={CHECK_VARIANT[c.status]} label={c.status} />
                  </li>
                ))}
              </ul>
            ) : null}

            {tab === "Tasks" ? (
              <ul className="space-y-1 rounded-xl border bg-white p-3 text-xs">
                {model.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1">
                    <span className={t.done ? "text-emerald-600" : "text-slate-400"}>
                      {t.done ? "☑" : "□"}
                    </span>
                    <span className={cn("flex-1", t.done && "line-through text-slate-500")}>
                      {t.label}
                    </span>
                    {!t.done &&
                    ["configure_roles", "load_catalog", "assign_agent", "verify_isolation"].includes(
                      t.id
                    ) ? (
                      <Button
                        type="button"
                        variant="outline"
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
                  onClick={() => {
                    setActivePage("distributorManagement");
                  }}
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

const DIST_STATUS_VARIANT = {
  active: "success",
  pending: "info",
  suspended: "neutral",
};
