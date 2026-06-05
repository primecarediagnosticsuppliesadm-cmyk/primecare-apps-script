import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
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
import { formatContractInr } from "@/labContract/labContractEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { FileText, RefreshCw, Plus, CheckCircle2 } from "lucide-react";

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

function ContractRow({ c, selected, onSelect }) {
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
        <StatusBadge variant={STATUS_VARIANT[c.status] || "neutral"} label={c.status} />
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
  const [tab, setTab] = useState("Dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState("");
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
      const data = await loadLabContractEngineBundle(currentUser, {
        force: true,
        scopeTenantId: distributorScope?.tenantId || "",
      });
      setBundle(data);
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
    const labs = bundle?.opsPayload?.dashboard?.labs || [];
    return labs.map((l) => ({
      id: l.labId ?? l.lab_id,
      name: l.labName ?? l.lab_name ?? l.labId,
    }));
  }, [bundle]);

  async function handleCreate(e) {
    e.preventDefault();
    const created = createLabContractDraft(
      bundle.tenantId,
      {
        ...form,
        distributorId: bundle.tenantId,
        distributorName: form.distributorName || currentUser?.tenantName || "HQ",
      },
      currentUser?.name || currentUser?.email
    );
    setMsg(`Created ${created.contractNumber}`);
    setShowCreate(false);
    await load();
    setSelectedId(created.id);
  }

  async function handleSuggest() {
    const n = suggestDraftContractsFromOps(
      bundle.tenantId,
      bundle.opsPayload,
      currentUser?.tenantName || "HQ"
    );
    setMsg(n.length ? `Suggested ${n.length} draft contract(s)` : "No new qualification-backed drafts");
    await load();
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
          <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>
      ) : null}

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

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
          <Button type="button" size="sm" variant="ghost" className="w-full text-xs" onClick={() => void handleSuggest()}>
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
                    variant={STATUS_VARIANT[selected.status] || "neutral"}
                    label={selected.status}
                  />
                  <StatusBadge
                    variant={HEALTH_VARIANT[selected.healthBand] || "neutral"}
                    label={selected.healthBand}
                  />
                </div>
              </div>

              {tab === "Dashboard" || tab === "Commercial" ? (
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
                <div className="mt-3">
                  <p className="mb-2 font-semibold">Readiness {selected.readiness?.score}%</p>
                  <ul className="space-y-1">
                    {selected.readiness?.checks?.map((ch) => (
                      <li key={ch.id} className="flex items-center gap-2">
                        <CheckCircle2
                          className={cn(
                            "h-3.5 w-3.5",
                            ch.pass ? "text-emerald-600" : "text-slate-300"
                          )}
                        />
                        {ch.label}
                      </li>
                    ))}
                  </ul>
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
                        const r = renewLabContract(bundle.tenantId, selected.id, currentUser);
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
                        const r = extendLabContract(bundle.tenantId, selected.id, 90, currentUser);
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
                        const r = terminateLabContract(
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
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                  {(selected.timeline || []).length === 0 ? (
                    <li className="text-slate-500">No timeline events</li>
                  ) : (
                    [...(selected.timeline || [])].reverse().map((ev, i) => (
                      <li key={i} className="rounded border border-slate-100 px-2 py-1">
                        <span className="font-medium capitalize">{ev.type}</span> ·{" "}
                        {ev.at ? new Date(ev.at).toLocaleString() : ""} · {ev.actor}
                        {ev.note ? <span className="block text-slate-500">{ev.note}</span> : null}
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

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                {selected.status === CONTRACT_STATUSES.DRAFT ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      submitLabContractForReview(bundle.tenantId, selected.id, currentUser);
                      setMsg("Submitted for review");
                      await load();
                    }}
                  >
                    Submit for review
                  </Button>
                ) : null}
                {selected.status === CONTRACT_STATUSES.UNDER_REVIEW ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        approveLabContract(bundle.tenantId, selected.id, currentUser);
                        setMsg("Approved");
                        await load();
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                      const r = activateLabContract(bundle.tenantId, selected.id, currentUser);
                      setMsg(
                        r
                          ? "Activated"
                          : "Activation blocked — complete readiness checklist"
                      );
                      await load();
                    }}
                    >
                      Activate
                    </Button>
                  </>
                ) : null}
                {setActivePage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePage("distributorManagement")}
                  >
                    Distributor workspace
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
              Monthly commitment (INR)
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1"
                value={form.monthlyCommitment}
                onChange={(e) => setForm((f) => ({ ...f, monthlyCommitment: e.target.value }))}
              />
            </label>
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
