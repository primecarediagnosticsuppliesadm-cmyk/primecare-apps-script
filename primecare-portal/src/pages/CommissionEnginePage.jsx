import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  loadCommissionEngineBundle,
  approveCommissionEntry,
  approveAllPendingCommissions,
  recordCommissionPayout,
  rejectCommissionEntry,
} from "@/commission/commissionData.js";
import { filterDistributorRegistry } from "@/distributor/distributorOsEngine.js";
import { loadDistributorWorkspaceBundle } from "@/distributor/distributorWorkspaceData.js";
import { COMMISSION_PHASE_RULES } from "@/commission/commissionRules.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { Coins, RefreshCw, CheckCircle2, IndianRupee, XCircle, Eye } from "lucide-react";

const WRITE_TABS = ["Overview", "Agents", "Pending", "Approved", "Paid", "Payouts", "Rules"];
const READ_ONLY_TABS = ["Overview", "Agents", "Pending", "Approved", "Paid", "Payouts", "Rules"];

const STATUS_VARIANT = {
  pending: "warning",
  approved: "info",
  paid: "success",
  rejected: "neutral",
};

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function AgentCard({ row, onApprove, onReject, showApprove, showReject }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-900">{row.agentName}</p>
        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
      </div>
      <p className="text-slate-600">
        Collected {formatInr(row.collectedAmount)} · Revenue {formatInr(row.revenueAttributed)}
      </p>
      <p className="font-bold text-indigo-700">{formatInr(row.commissionAmount)} commission</p>
      <p className="text-[10px] text-slate-500">
        Efficiency {row.efficiencyPct}% · {row.labsTouched} labs
        {!row.thresholdMet ? " · Below threshold" : ""}
      </p>
      {showApprove && row.status === "pending" && row.thresholdMet && onApprove ? (
        <Button type="button" size="sm" variant="outline" className="mt-1 h-7 text-[10px]" onClick={onApprove}>
          Approve
        </Button>
      ) : null}
      {showReject && row.status === "pending" && onReject ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-1 h-7 text-[10px] text-red-700"
          onClick={onReject}
        >
          <XCircle className="mr-0.5 h-3 w-3" /> Reject
        </Button>
      ) : null}
    </div>
  );
}

export default function CommissionEnginePage({
  currentUser = null,
  distributorScope = null,
  embedded = false,
}) {
  const readOnly = embedded;
  const homeTenantId = String(currentUser?.tenantId || currentUser?.tenant_id || "").trim();

  const [loading, setLoading] = useState(true);
  const [loadingDistributors, setLoadingDistributors] = useState(!embedded);
  const [distributors, setDistributors] = useState([]);
  const [selectedDistributorId, setSelectedDistributorId] = useState(
    distributorScope?.tenantId || ""
  );
  const [bundle, setBundle] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [msg, setMsg] = useState("");

  const scopeTenantId = embedded
    ? String(distributorScope?.tenantId || "").trim()
    : selectedDistributorId;

  const writeEnabled = !readOnly && Boolean(scopeTenantId);

  useEffect(() => {
    if (embedded) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingDistributors(true);
        const workspace = await loadDistributorWorkspaceBundle(currentUser);
        const rows = filterDistributorRegistry(workspace.registry || [], homeTenantId);
        if (cancelled) return;
        setDistributors(rows);
        if (rows.length === 1) {
          setSelectedDistributorId(rows[0].id);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setMsg(err?.message || "Failed to load distributors");
      } finally {
        if (!cancelled) setLoadingDistributors(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, embedded, homeTenantId]);

  const load = useCallback(async () => {
    if (!scopeTenantId) {
      setBundle(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await loadCommissionEngineBundle(currentUser, {
        force: true,
        scopeTenantId,
      });
      setBundle(data);
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Failed to load commission engine");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser, scopeTenantId]);

  useEffect(() => {
    if (embedded || !loadingDistributors) {
      void load();
    }
  }, [load, embedded, loadingDistributors]);

  const model = bundle?.model;
  const liability = bundle?.liability;
  const selectedDistributor = distributors.find((d) => d.id === selectedDistributorId);
  const scopeLabel =
    distributorScope?.tenantName ||
    selectedDistributor?.name ||
    scopeTenantId ||
    "distributor";

  const paidEntries = useMemo(
    () => (model?.entries || []).filter((e) => e.status === "paid"),
    [model?.entries]
  );

  const tabs = readOnly ? READ_ONLY_TABS : WRITE_TABS;

  const predatorSnapshot = useMemo(() => {
    if (!model && !scopeTenantId && !embedded) return null;
    return {
      commissionEngine: true,
      embedded,
      readOnly,
      writeEnabled,
      hqWriteSurfaceAvailable: writeEnabled,
      distributorOsReadOnly: readOnly,
      selectedDistributorId: scopeTenantId || null,
      periodYmd: model?.periodYmd,
      agentCount: model?.summary?.agentCount ?? 0,
      pendingTotal: model?.summary?.pendingTotal ?? 0,
      phaseId: model?.phaseId,
    };
  }, [model, embedded, readOnly, writeEnabled, scopeTenantId]);

  usePredatorModuleValidation(
    "Commission Engine",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  async function handleApproveOne(entryId) {
    if (!writeEnabled) return;
    const entry = await approveCommissionEntry(
      bundle.tenantId,
      entryId,
      currentUser?.name || currentUser?.email
    );
    setMsg(entry ? "Commission approved" : "Could not approve commission");
    await load();
  }

  async function handleRejectOne(entryId) {
    if (!writeEnabled) return;
    const entry = await rejectCommissionEntry(
      bundle.tenantId,
      entryId,
      currentUser?.name || currentUser?.email
    );
    setMsg(entry ? "Commission rejected" : "Could not reject commission");
    await load();
  }

  async function handleApproveAll() {
    if (!writeEnabled || !model) return;
    const n = await approveAllPendingCommissions(bundle.tenantId, model.periodYmd, currentUser);
    setMsg(`Approved ${n.length} commission(s)`);
    await load();
  }

  async function handlePayout() {
    if (!writeEnabled || !model) return;
    const p = await recordCommissionPayout(bundle.tenantId, model.periodYmd, currentUser);
    if (p?.duplicate) {
      setMsg("Payout already recorded");
      return;
    }
    if (p?.error) {
      setMsg(p.error);
      return;
    }
    setMsg(p ? `Payout recorded · ${formatInr(p.totalCommission)}` : "No approved commissions to pay");
    await load();
  }

  if (!embedded && loadingDistributors) return <PageSkeleton rows={6} />;

  if (!embedded && distributors.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
        <header>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Coins className="h-5 w-5 text-indigo-600" />
            Commission Engine
          </h1>
          <p className="text-xs text-slate-600">PrimeCare HQ financial controls</p>
        </header>
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No distributors available. Launch a distributor before managing commissions.
        </p>
      </div>
    );
  }

  if (!embedded && !scopeTenantId) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Coins className="h-5 w-5 text-indigo-600" />
              Commission Engine
            </h1>
            <p className="text-xs text-slate-600">PrimeCare HQ financial controls</p>
          </div>
        </header>
        <label className="block text-xs font-medium text-slate-600">
          Select distributor
          <select
            className="mt-1 w-full max-w-md rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={selectedDistributorId}
            onChange={(e) => setSelectedDistributorId(e.target.value)}
          >
            <option value="">Choose distributor…</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || d.id}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">Select a distributor to load commission data.</p>
      </div>
    );
  }

  if (loading) return <PageSkeleton rows={8} />;
  if (!model) return <p className="p-4 text-sm text-slate-500">No commission data.</p>;

  const { rule, summary } = model;
  const payoutRecorded = model.payouts.some(
    (p) => p.periodYmd === model.periodYmd && p.status === "paid"
  );

  const kpiCards = [
    { label: "Pending", value: formatInr(summary.pendingTotal), sub: `${summary.pendingCount} entries` },
    { label: "Approved", value: formatInr(summary.approvedTotal), sub: `${summary.approvedCount} entries` },
    { label: "Paid", value: formatInr(summary.paidTotal), sub: `${summary.paidCount} entries` },
    {
      label: "Liability",
      value: formatInr(liability?.liabilityTotal ?? summary.pendingTotal + summary.approvedTotal),
      sub: liability
        ? `${formatInr(liability.outstandingTotal)} outstanding`
        : "pending + approved",
    },
  ];

  return (
    <div className={embedded ? "space-y-3" : "mx-auto max-w-5xl space-y-3 p-3 pb-8"}>
      {!embedded ? (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Coins className="h-5 w-5 text-indigo-600" />
              Commission Engine
            </h1>
            <p className="text-[11px] text-slate-600">
              PrimeCare HQ · {scopeLabel} · {model.periodYmd}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </header>
      ) : (
        <p className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Read-only reporting · Approve and payout in PrimeCare HQ Commission Engine
        </p>
      )}

      {!embedded && distributors.length > 1 ? (
        <label className="block text-xs font-medium text-slate-600">
          Distributor
          <select
            className="mt-1 w-full max-w-md rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={selectedDistributorId}
            onChange={(e) => setSelectedDistributorId(e.target.value)}
          >
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || d.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-white px-2 py-2 text-xs">
            <p className="text-slate-500">{c.label}</p>
            <p className="text-base font-bold tabular-nums">{c.value}</p>
            <p className="text-[10px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
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
          <p>
            <strong>Attribution:</strong> payments in {model.periodYmd} → lab agent; fulfilled orders →
            revenue share.
          </p>
          <p className="mt-1">
            <strong>Rate:</strong> {(rule.collectionRate * 100).toFixed(1)}% collections +{" "}
            {(rule.revenueShare * 100).toFixed(1)}% revenue.
          </p>
          <p className="mt-1">
            <strong>Thresholds:</strong> min {formatInr(rule.minMonthlyCollection)} collected,{" "}
            {rule.minEfficiencyPct}% efficiency.
          </p>
          {writeEnabled ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void handleApproveAll()}>
                <CheckCircle2 className="h-4 w-4" /> Approve all eligible
              </Button>
              {payoutRecorded ? (
                <p className="text-xs font-medium text-emerald-700">Payout already recorded</p>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => void handlePayout()}>
                  <IndianRupee className="h-4 w-4" /> Record monthly payout
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "Agents" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {model.agents.length === 0 ? (
            <p className="text-xs text-slate-500">No agent attribution — assign agents to labs first.</p>
          ) : (
            model.agents.map((a) => <AgentCard key={a.agentKey} row={a} />)
          )}
        </div>
      ) : null}

      {tab === "Pending" ? (
        <div className="space-y-2">
          {model.pending.length === 0 ? (
            <p className="text-xs text-slate-500">No pending commissions.</p>
          ) : (
            model.pending.map((e) => (
              <AgentCard
                key={e.id}
                row={e}
                showApprove={writeEnabled}
                showReject={writeEnabled}
                onApprove={() => void handleApproveOne(e.id)}
                onReject={() => void handleRejectOne(e.id)}
              />
            ))
          )}
        </div>
      ) : null}

      {tab === "Approved" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {model.approved.length === 0 ? (
            <p className="text-xs text-slate-500">No approved commissions awaiting payout.</p>
          ) : (
            model.approved.map((e) => <AgentCard key={e.id} row={e} />)
          )}
        </div>
      ) : null}

      {tab === "Paid" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {paidEntries.length === 0 ? (
            <p className="text-xs text-slate-500">No paid commissions for this period.</p>
          ) : (
            paidEntries.map((e) => <AgentCard key={e.id} row={e} />)
          )}
        </div>
      ) : null}

      {tab === "Payouts" ? (
        <ul className="space-y-2 text-xs">
          {model.payouts.length === 0 ? (
            <li className="rounded border bg-white p-3 text-slate-500">No payout ledger entries yet.</li>
          ) : (
            model.payouts.map((p) => (
              <li key={p.id} className="rounded-lg border bg-white p-2">
                <p className="font-semibold">{p.periodYmd}</p>
                <p>
                  {formatInr(p.totalCommission)} · {p.agentCount} agents
                </p>
                <p className="text-slate-500">{p.paidAt ? new Date(p.paidAt).toLocaleString() : ""}</p>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "Rules" ? (
        <div className="space-y-2 text-xs">
          {Object.entries(COMMISSION_PHASE_RULES).map(([id, r]) => (
            <div
              key={id}
              className={cn(
                "rounded-lg border p-2",
                id === model.phaseId ? "border-indigo-400 bg-indigo-50" : "bg-white"
              )}
            >
              <p className="font-bold">{r.label}</p>
              <p>
                Collection {(r.collectionRate * 100).toFixed(1)}% · Revenue share{" "}
                {(r.revenueShare * 100).toFixed(1)}%
              </p>
              <p>
                Min collection {formatInr(r.minMonthlyCollection)} · Min efficiency {r.minEfficiencyPct}%
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
