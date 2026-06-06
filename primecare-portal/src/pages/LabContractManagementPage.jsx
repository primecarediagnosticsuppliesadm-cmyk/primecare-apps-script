import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, usePortalToast } from "@/components/ux";
import { getLabsCredit } from "@/api/primecareSupabaseApi.js";
import {
  loadLabContractEngineBundle,
  createLabContractDraft,
  activateLabContract,
  submitLabContractForReview,
  approveLabContract,
  renewLabContract,
  extendLabContract,
  terminateLabContract,
  suggestDraftContractsFromOps,
  invalidateLabContractCache,
} from "@/labContract/labContractData.js";
import {
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  PAYMENT_TERMS_OPTIONS,
} from "@/labContract/labContractTypes.js";
import {
  buildOpsLookups,
  computeContractReadiness,
  formatContractInr,
} from "@/labContract/labContractEngine.js";
import { ROLES } from "@/config/roles.js";
import { labIdKey } from "@/utils/labId.js";
import { buildContractRenewalIntelligence } from "@/contracts/contractRenewalIntelligenceEngine.js";
import { ContractRenewalSummaryPanel } from "@/components/contracts/ContractRenewalIntelligencePanels.jsx";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { FileText, RefreshCw, Plus, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const TABS = [
  "Dashboard",
  "Registry",
  "Commercial",
  "L1B Rentals",
  "Readiness",
  "Renewal",
  "Timeline",
];

const STATUS_VARIANT = {
  Draft: "neutral",
  "Under Review": "info",
  Approved: "info",
  Active: "success",
  Suspended: "warning",
  Expired: "neutral",
  Terminated: "danger",
};

const HEALTH_VARIANT = {
  Healthy: "success",
  Watch: "warning",
  Risk: "danger",
};

const TIMELINE_LABELS = {
  created: "Created",
  submitted: "Submitted",
  approved: "Approved",
  activated: "Activated",
  suspended: "Suspended",
  renewed: "Renewed",
  expired: "Expired",
  terminated: "Terminated",
};

function findTimelineEvent(timeline = [], type) {
  const key = String(type || "").toLowerCase();
  return (
    [...(timeline || [])].reverse().find((e) => String(e.type || "").toLowerCase() === key) ||
    null
  );
}

function formatLifecycleWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Display status — Approved is a lifecycle milestone when under review + approved event. */
function contractDisplayStatus(contract = {}) {
  const approved = findTimelineEvent(contract.timeline, "approved");
  if (contract.status === CONTRACT_STATUSES.ACTIVE) {
    return { label: CONTRACT_STATUSES.ACTIVE, variant: STATUS_VARIANT.Active };
  }
  if (approved && contract.status === CONTRACT_STATUSES.UNDER_REVIEW) {
    return { label: "Approved", variant: STATUS_VARIANT.Approved };
  }
  return {
    label: contract.status || "—",
    variant: STATUS_VARIANT[contract.status] || "neutral",
  };
}

function contractLifecycleSummary(contract = {}) {
  const created = findTimelineEvent(contract.timeline, "created");
  const submitted = findTimelineEvent(contract.timeline, "submitted");
  const approved = findTimelineEvent(contract.timeline, "approved");
  const activated = findTimelineEvent(contract.timeline, "activated");
  const display = contractDisplayStatus(contract);
  return {
    display,
    created,
    submitted,
    approved,
    activated,
    daysRemaining:
      contract.daysToExpiry != null ? `${contract.daysToExpiry} days` : "—",
  };
}

function activationBlockerMessages(contract, readiness, distributorScope) {
  const blockers = [];
  if (distributorScope?.canOperate === false) {
    blockers.push("Distributor inactive");
  }
  for (const ch of readiness?.checks || []) {
    if (ch.pass) continue;
    if (ch.id === "payment_terms") blockers.push("Missing payment terms");
    else if (ch.id === "commercial_terms") blockers.push("Missing commercial terms");
    else if (ch.id === "owner") blockers.push("Missing owner");
    else if (ch.id === "distributor") blockers.push("Distributor not found in registry");
    else if (ch.id === "lab") blockers.push("Lab not found in operational data");
    else blockers.push(ch.label);
  }
  if (readiness && num(readiness.score) < 100) {
    blockers.push(`Readiness below 100% (${readiness.score}%)`);
  }
  return [...new Set(blockers)];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ContractRow({ c, selected, onSelect }) {
  const display = contractDisplayStatus(c);
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={cn(
        "w-full rounded-lg border p-2 text-left text-xs",
        selected ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex justify-between gap-2">
        <p className="font-semibold text-slate-900">{c.contractNumber}</p>
        <StatusBadge variant={display.variant} label={display.label} compact />
      </div>
      <p className="text-slate-600">
        {c.labName} · {c.contractType}
      </p>
      <p className="text-[10px] text-slate-500">
        {c.distributorName || c.distributorId} · Health {c.healthScore}%
      </p>
    </button>
  );
}

export default function LabContractManagementPage({
  currentUser = null,
  setActivePage = null,
  distributorScope = null,
  embedded = false,
}) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [distributorLabs, setDistributorLabs] = useState([]);
  const [tab, setTab] = useState("Dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState("");
  const [activationBlockers, setActivationBlockers] = useState([]);
  const { showToast } = usePortalToast();
  const [form, setForm] = useState({
    labId: "",
    labName: "",
    contractType: CONTRACT_TYPES.L1A_CONSUMABLES,
    distributorName: "",
    owner: "",
    paymentTerms: "30 Days",
    monthlyCommitment: "",
    creditLimit: "",
    collectionTargetPct: "85",
    distributorMarginPct: "",
    primecareMarginPct: "",
    instrumentName: "",
    instrumentValue: "",
    lockInMonths: "12",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    autoRenewal: true,
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      invalidateLabContractCache();
      const scopeTenantId = distributorScope?.tenantId || "";
      const [data, labsRes] = await Promise.all([
        loadLabContractEngineBundle(currentUser, {
          force: true,
          scopeTenantId,
        }),
        getLabsCredit().catch(() => ({ data: [] })),
      ]);
      setBundle(data);
      const scopeId = String(scopeTenantId || "").trim();
      const labs = Array.isArray(labsRes?.data) ? labsRes.data : [];
      setDistributorLabs(
        scopeId
          ? labs.filter((lab) => String(lab.tenantId || "").trim() === scopeId)
          : labs
      );
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Failed to load contracts");
    } finally {
      setLoading(false);
    }
  }, [currentUser, distributorScope?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActivationBlockers([]);
  }, [selectedId]);

  const model = bundle?.model;
  const selected = useMemo(
    () => model?.contracts?.find((c) => c.id === selectedId) || model?.contracts?.[0] || null,
    [model, selectedId]
  );

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      labContractEngine: true,
      activeCount: model.dashboard.activeCount,
      healthScore: model.dashboard.contractHealthScore,
      pipelineCount: model.dashboard.pipelineCount,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Lab Contract Engine",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  const labOptions = useMemo(() => {
    const byId = new Map();
    for (const lab of distributorLabs) {
      const id = labIdKey(lab.labId);
      if (!id) continue;
      byId.set(id, { id, name: lab.labName || id });
    }
    const lookups = buildOpsLookups(bundle?.opsPayload || {});
    for (const lab of lookups.labs.values()) {
      const id = labIdKey(lab.labId);
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, name: lab.labName || id });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [bundle, distributorLabs]);

  const role = String(currentUser?.role || "").toLowerCase();
  const canCreateContract =
    (role === ROLES.EXECUTIVE || role === ROLES.ADMIN) &&
    (!embedded || (Boolean(distributorScope?.tenantId) && distributorScope?.canOperate !== false));

  function openCreateForm() {
    setForm((f) => ({
      ...f,
      distributorName: distributorScope?.tenantName || f.distributorName || "",
      labId: "",
      labName: "",
      owner: currentUser?.name || currentUser?.email || f.owner || "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
    }));
    setShowCreate(true);
  }

  const renewalIntel = useMemo(
    () =>
      model
        ? buildContractRenewalIntelligence(model, {
            distributorId: distributorScope?.tenantId || "",
          })
        : null,
    [model, distributorScope?.tenantId]
  );

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const created = await createLabContractDraft(
        bundle.tenantId,
        {
          ...form,
          distributorId: bundle.tenantId,
          distributorName:
            form.distributorName ||
            distributorScope?.tenantName ||
            currentUser?.tenantName ||
            "HQ",
        },
        currentUser?.name || currentUser?.email
      );
      showToast("success", `Contract draft created — ${created.contractNumber}`);
      setMsg(`Created ${created.contractNumber}`);
      setShowCreate(false);
      setActivationBlockers([]);
      await refreshAndSelect(created.id);
    } catch (err) {
      setMsg(err?.message || "Failed to create contract");
    }
  }

  const selectedLifecycle = useMemo(
    () => (selected ? contractLifecycleSummary(selected) : null),
    [selected]
  );

  const selectedReadinessPreview = useMemo(() => {
    if (!selected || !bundle) return null;
    const lookups = bundle.model?.lookups || buildOpsLookups(bundle.opsPayload || {});
    const distributors = new Set(bundle.distributors || [bundle.tenantId]);
    return (
      selected.readiness ||
      computeContractReadiness(selected, { labs: lookups.labs, distributors })
    );
  }, [selected, bundle]);

  async function refreshAndSelect(contractId) {
    await load();
    if (contractId) setSelectedId(contractId);
  }

  async function handleSubmitReview() {
    if (!selected) return;
    setActivationBlockers([]);
    const r = await submitLabContractForReview(bundle.tenantId, selected.id, currentUser);
    if (r) {
      showToast("success", "Contract submitted for review");
      setMsg("Submitted for review");
      await refreshAndSelect(r.id);
    } else {
      showToast("error", "Submit failed — contract must be Draft");
      setMsg("Submit failed — contract must be Draft");
    }
  }

  async function handleApprove() {
    if (!selected) return;
    setActivationBlockers([]);
    const r = await approveLabContract(bundle.tenantId, selected.id, currentUser);
    if (r) {
      showToast("success", "Contract approved");
      setMsg("Contract approved");
      await refreshAndSelect(r.id);
    } else {
      showToast("error", "Approve failed — contract must be Under Review");
      setMsg("Approve failed — contract must be Under Review");
    }
  }

  async function handleActivate() {
    if (!selected) return;
    const readiness = selectedReadinessPreview;
    const blockers = activationBlockerMessages(selected, readiness, distributorScope);
    if (blockers.length > 0) {
      setActivationBlockers(blockers);
      showToast("error", "Activation blocked — see blockers below");
      setMsg("Activation blocked — complete readiness checklist");
      return;
    }
    const r = await activateLabContract(bundle.tenantId, selected.id, currentUser);
    if (r) {
      setActivationBlockers([]);
      showToast("success", "Contract activated");
      setMsg("Contract activated");
      await refreshAndSelect(r.id);
    } else {
      const afterBlockers = activationBlockerMessages(selected, readiness, distributorScope);
      setActivationBlockers(
        afterBlockers.length ? afterBlockers : ["Activation failed — readiness or status check did not pass"]
      );
      showToast("error", "Activation blocked — see blockers below");
      setMsg("Activation blocked — complete readiness checklist");
    }
  }

  async function handleSuggest() {
    try {
      const n = await suggestDraftContractsFromOps(
        bundle.tenantId,
        bundle.opsPayload,
        currentUser?.tenantName || "HQ"
      );
      setMsg(
        n.length ? `Suggested ${n.length} draft contract(s)` : "No new qualification-backed drafts"
      );
      await load();
    } catch (err) {
      setMsg(err?.message || "Failed to suggest contracts");
    }
  }

  if (loading) return <PageSkeleton rows={8} />;
  if (!model) return <p className="p-4 text-sm text-slate-500">No contract data.</p>;

  const dash = model.dashboard;
  const renewal = model.renewal;

  return (
    <div className={embedded ? "space-y-3" : "mx-auto max-w-6xl space-y-3 p-3 pb-8"}>
      {!embedded ? (
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileText className="h-5 w-5 text-indigo-600" />
            Lab Contract Engine
          </h1>
          <p className="text-[11px] text-slate-600">
            {distributorScope?.tenantId
              ? `Contracts for ${distributorScope.tenantName || "selected distributor"} only.`
              : "PrimeCare HQ contracts only — open Distributor OS for distributor lab contracts."}
          </p>
        </div>
        <div className="flex gap-1">
          {canCreateContract ? (
            <Button type="button" size="sm" variant="outline" onClick={openCreateForm}>
              <Plus className="h-4 w-4" /> New
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Lab contracts</p>
            <p className="text-[10px] text-slate-500">
              {distributorScope?.tenantName || "Selected distributor"} · create or import drafts
            </p>
          </div>
          <div className="flex gap-1">
            {canCreateContract ? (
              <Button type="button" size="sm" onClick={openCreateForm}>
                <Plus className="h-4 w-4" /> New Contract
              </Button>
            ) : (
              <p className="text-[10px] text-amber-700">
                Activate distributor to create contracts
              </p>
            )}
            <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

      {embedded ? <ContractRenewalSummaryPanel renewal={renewalIntel} compact /> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Active", value: dash.activeCount },
          { label: "Committed / mo", value: dash.monthlyCommittedLabel },
          { label: "Revenue under contract", value: dash.revenueUnderContractLabel },
          { label: "Expiring 90d", value: dash.expiring90Count },
          { label: "L1B rentals", value: dash.reagentRentalsActive },
          { label: "Health score", value: `${dash.contractHealthScore}%` },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-white px-2 py-2 text-xs">
            <p className="text-slate-500">{k.label}</p>
            <p className="text-base font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

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

      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {model.contracts.length === 0 ? (
            <p className="text-xs text-slate-500">
              No contracts yet. Create one or import drafts from qualifications.
            </p>
          ) : (
            model.contracts.map((c) => (
              <ContractRow
                key={c.id}
                c={c}
                selected={selected?.id === c.id}
                onSelect={setSelectedId}
              />
            ))
          )}
          {canCreateContract ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={openCreateForm}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Contract
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full text-xs"
            onClick={() => void handleSuggest()}
          >
            Import qualification drafts
          </Button>
        </div>

        <div className="min-h-[200px] rounded-xl border bg-white p-3 text-xs">
          {!selected ? (
            <p className="text-slate-500">Select a contract</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selected.contractNumber}</p>
                  <p className="text-slate-600">
                    {selected.labName} · {selected.contractType}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <StatusBadge
                    variant={selectedLifecycle?.display.variant || "neutral"}
                    label={selectedLifecycle?.display.label || selected.status}
                  />
                  <StatusBadge
                    variant={HEALTH_VARIANT[selected.healthBand] || "neutral"}
                    label={selected.healthBand}
                  />
                </div>
              </div>

              {tab === "Dashboard" ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Lifecycle status</dt>
                    <dd className="font-medium">{selectedLifecycle?.display.label}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Days remaining</dt>
                    <dd>{selectedLifecycle?.daysRemaining}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created</dt>
                    <dd>
                      {selectedLifecycle?.created
                        ? `${formatLifecycleWhen(selectedLifecycle.created.at)} · ${selectedLifecycle.created.actor || "—"}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Submitted</dt>
                    <dd>
                      {selectedLifecycle?.submitted
                        ? formatLifecycleWhen(selectedLifecycle.submitted.at)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Approved by</dt>
                    <dd>{selectedLifecycle?.approved?.actor || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Approved at</dt>
                    <dd>{formatLifecycleWhen(selectedLifecycle?.approved?.at)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Activated by</dt>
                    <dd>{selectedLifecycle?.activated?.actor || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Activated at</dt>
                    <dd>{formatLifecycleWhen(selectedLifecycle?.activated?.at)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Readiness</dt>
                    <dd>{selected.readiness?.score ?? 0}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Revenue under contract</dt>
                    <dd>{formatContractInr(selected.revenueUnderContract)}</dd>
                  </div>
                </dl>
              ) : null}

              {tab === "Commercial" ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Distributor</dt>
                    <dd>{selected.distributorName || selected.distributorId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Owner</dt>
                    <dd>{selected.owner || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Monthly commitment</dt>
                    <dd>{formatContractInr(selected.commercial?.monthlyCommitment)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Credit limit</dt>
                    <dd>{formatContractInr(selected.commercial?.creditLimit)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment terms</dt>
                    <dd>{selected.commercial?.paymentTerms || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Collection target</dt>
                    <dd>{selected.commercial?.collectionTargetPct}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Margins</dt>
                    <dd>
                      Dist {selected.commercial?.distributorMarginPct}% · PC{" "}
                      {selected.commercial?.primecareMarginPct}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Revenue under contract</dt>
                    <dd>{formatContractInr(selected.revenueUnderContract)}</dd>
                  </div>
                </dl>
              ) : null}

              {tab === "L1B Rentals" && selected.l1b ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Instrument</dt>
                    <dd>{selected.l1b.instrumentName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Value</dt>
                    <dd>{formatContractInr(selected.l1b.instrumentValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Utilization</dt>
                    <dd>{selected.l1b.utilizationPct}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Fulfillment</dt>
                    <dd>{selected.l1b.fulfillmentPct}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Lock-in remaining</dt>
                    <dd>{selected.l1b.lockInMonthsRemaining} mo</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Compliance</dt>
                    <dd>
                      <StatusBadge
                        variant={
                          selected.l1b.compliance === "Compliant"
                            ? "success"
                            : selected.l1b.compliance === "At Risk"
                              ? "warning"
                              : "danger"
                        }
                        label={selected.l1b.compliance}
                      />
                    </dd>
                  </div>
                </dl>
              ) : tab === "L1B Rentals" ? (
                <p className="mt-2 text-slate-500">Not an L1B / Hybrid contract.</p>
              ) : null}

              {tab === "Readiness" ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Readiness score</p>
                    <StatusBadge
                      variant={
                        num(selectedReadinessPreview?.score) >= 100
                          ? "success"
                          : num(selectedReadinessPreview?.score) >= 60
                            ? "warning"
                            : "danger"
                      }
                      label={`${selectedReadinessPreview?.score ?? 0}%`}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Passed checks
                    </p>
                    <ul className="space-y-1">
                      {(selectedReadinessPreview?.checks || [])
                        .filter((ch) => ch.pass)
                        .map((ch) => (
                          <li key={ch.id} className="flex items-center gap-2 text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            {ch.label}
                          </li>
                        ))}
                      {(selectedReadinessPreview?.checks || []).filter((ch) => ch.pass).length ===
                      0 ? (
                        <li className="text-slate-500">No checks passed yet</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Failed checks
                    </p>
                    <ul className="space-y-1">
                      {(selectedReadinessPreview?.checks || [])
                        .filter((ch) => !ch.pass)
                        .map((ch) => (
                          <li key={ch.id} className="flex items-center gap-2 text-red-800">
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            {ch.label}
                          </li>
                        ))}
                      {(selectedReadinessPreview?.checks || []).filter((ch) => !ch.pass).length ===
                      0 ? (
                        <li className="text-slate-500">All checks passed</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Remaining blockers
                    </p>
                    <ul className="space-y-1">
                      {activationBlockerMessages(
                        selected,
                        selectedReadinessPreview,
                        distributorScope
                      ).map((b) => (
                        <li key={b} className="flex items-center gap-2 text-amber-900">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          {b}
                        </li>
                      ))}
                      {activationBlockerMessages(
                        selected,
                        selectedReadinessPreview,
                        distributorScope
                      ).length === 0 ? (
                        <li className="text-emerald-700">Ready to activate</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              ) : null}

              {tab === "Renewal" ? (
                <div className="mt-3 space-y-2">
                  <p>
                    Expires: {selected.endDate || "—"}
                    {selected.daysToExpiry != null
                      ? ` (${selected.daysToExpiry} days)`
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        const r = await renewLabContract(bundle.tenantId, selected.id, currentUser);
                        setMsg(r ? "Renewed" : "Renew failed");
                        await load();
                      }}
                    >
                      Renew
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const r = await extendLabContract(bundle.tenantId, selected.id, 90, currentUser);
                        setMsg(r ? "Extended 90 days" : "Extend failed");
                        await load();
                      }}
                    >
                      Extend 90d
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const r = await terminateLabContract(
                          bundle.tenantId,
                          selected.id,
                          currentUser,
                          "User terminated"
                        );
                        setMsg(r ? "Terminated" : "Terminate failed");
                        await load();
                      }}
                    >
                      Terminate
                    </Button>
                  </div>
                  <p className="text-slate-500">
                    Portfolio: {renewal.expiring30.length} / 30d · {renewal.expiring90.length} / 90d
                  </p>
                </div>
              ) : null}

              {tab === "Timeline" ? (
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {(selected.timeline || []).length === 0 ? (
                    <li className="text-slate-500">No timeline events</li>
                  ) : (
                    [...(selected.timeline || [])].reverse().map((ev, i) => (
                      <li
                        key={`${ev.type}-${ev.at}-${i}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {TIMELINE_LABELS[String(ev.type || "").toLowerCase()] ||
                              ev.type ||
                              "Event"}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {formatLifecycleWhen(ev.at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-600">By {ev.actor || "—"}</p>
                        {ev.note ? (
                          <p className="mt-0.5 text-[10px] text-slate-500">{ev.note}</p>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              ) : null}

              {tab === "Registry" ? (
                <p className="mt-2 text-slate-600">
                  {selected.startDate} → {selected.endDate} · Auto-renew{" "}
                  {selected.autoRenewal ? "Yes" : "No"}
                </p>
              ) : null}

              {activationBlockers.length > 0 ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Activation blocked
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {activationBlockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                {selected.status === CONTRACT_STATUSES.DRAFT ? (
                  <Button type="button" size="sm" onClick={() => void handleSubmitReview()}>
                    Submit for review
                  </Button>
                ) : null}
                {selected.status === CONTRACT_STATUSES.UNDER_REVIEW ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleApprove()}
                    >
                      Approve
                    </Button>
                    <Button type="button" size="sm" onClick={() => void handleActivate()}>
                      Activate
                    </Button>
                  </>
                ) : null}
                {setActivePage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePage("distributorOs")}
                  >
                    Distributor OS
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreate ? (
        <form
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onSubmit={(e) => void handleCreate(e)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 text-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-bold">New contract</p>
            <label className="block">
              Lab
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.labId}
                onChange={(e) => {
                  const opt = labOptions.find((l) => String(l.id) === e.target.value);
                  setForm((f) => ({
                    ...f,
                    labId: e.target.value,
                    labName: opt?.name || "",
                  }));
                }}
              >
                <option value="">Select lab</option>
                {labOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              Type
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.contractType}
                onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
              >
                {Object.values(CONTRACT_TYPES).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              Owner
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
              />
            </label>
            <label className="mt-2 block">
              Payment terms
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.paymentTerms}
                onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
              >
                {PAYMENT_TERMS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              Start date
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </label>
            <label className="mt-2 block">
              End date
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
            <label className="mt-2 block">
              Monthly commitment (INR)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.monthlyCommitment}
                onChange={(e) => setForm((f) => ({ ...f, monthlyCommitment: e.target.value }))}
              />
            </label>
            <label className="mt-2 block">
              Credit limit (INR)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />
            </label>
            <label className="mt-2 block">
              Collection target (%)
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.collectionTargetPct}
                onChange={(e) => setForm((f) => ({ ...f, collectionTargetPct: e.target.value }))}
              />
            </label>
            <p className="mt-2 text-[10px] text-slate-500">
              Provide at least one commercial value: monthly commitment, credit limit, or collection
              target.
            </p>
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm">
                Create draft
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
