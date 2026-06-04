import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  loadCommissionEngineBundle,
  approveCommissionEntry,
  approveAllPendingCommissions,
  recordCommissionPayout,
} from "@/commission/commissionData.js";
import { COMMISSION_PHASE_RULES } from "@/commission/commissionRules.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { Coins, RefreshCw, CheckCircle2, IndianRupee } from "lucide-react";

const TABS = ["Overview", "Agents", "Pending", "Approved", "Payouts", "Rules"];
const STATUS_VARIANT = {
  pending: "warning",
  approved: "info",
  paid: "success",
};

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function AgentCard({ row, onApprove, showApprove }) {
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
    </div>
  );
}

export default function CommissionEnginePage({ currentUser = null }) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadCommissionEngineBundle(currentUser, { force: true });
      setBundle(data);
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Failed to load commission engine");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = bundle?.model;

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      commissionEngine: true,
      periodYmd: model.periodYmd,
      agentCount: model.summary.agentCount,
      pendingTotal: model.summary.pendingTotal,
      phaseId: model.phaseId,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Commission Engine",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  async function handleApproveOne(entryId) {
    approveCommissionEntry(bundle.tenantId, entryId, currentUser?.name || currentUser?.email);
    setMsg("Commission approved");
    await load();
  }

  async function handleApproveAll() {
    const n = await approveAllPendingCommissions(
      bundle.tenantId,
      model.periodYmd,
      currentUser
    );
    setMsg(`Approved ${n.length} commission(s)`);
    await load();
  }

  async function handlePayout() {
    const p = await recordCommissionPayout(bundle.tenantId, model.periodYmd, currentUser);
    setMsg(p ? `Payout recorded · ${formatInr(p.totalCommission)}` : "No approved commissions to pay");
    await load();
  }

  if (loading) return <PageSkeleton rows={8} />;
  if (!model) return <p className="p-4 text-sm text-slate-500">No commission data.</p>;

  const { rule, summary } = model;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Coins className="h-5 w-5 text-indigo-600" />
            Commission Engine
          </h1>
          <p className="text-[11px] text-slate-600">
            Collection-driven incentives · {model.periodYmd} · {rule.label} phase
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Pending", value: formatInr(summary.pendingTotal), sub: summary.pendingCount },
          { label: "Approved", value: formatInr(summary.approvedTotal), sub: summary.approvedCount },
          { label: "Collected", value: formatInr(summary.collectedTotal), sub: "attributed" },
          { label: "Agents", value: summary.agentCount, sub: `${summary.belowThreshold} below threshold` },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-white px-2 py-2 text-xs">
            <p className="text-slate-500">{c.label}</p>
            <p className="text-base font-bold tabular-nums">{c.value}</p>
            <p className="text-[10px] text-slate-400">{c.sub}</p>
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void handleApproveAll()}>
              <CheckCircle2 className="h-4 w-4" /> Approve all eligible
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void handlePayout()}>
              <IndianRupee className="h-4 w-4" /> Record monthly payout
            </Button>
          </div>
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
                showApprove
                onApprove={() => void handleApproveOne(e.id)}
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

      {tab === "Payouts" ? (
        <ul className="space-y-2 text-xs">
          {model.payouts.length === 0 ? (
            <li className="rounded border bg-white p-3 text-slate-500">No payout ledger entries yet.</li>
          ) : (
            model.payouts.map((p) => (
              <li key={p.id} className="rounded-lg border bg-white p-2">
                <p className="font-semibold">{p.periodYmd}</p>
                <p>{formatInr(p.totalCommission)} · {p.agentCount} agents</p>
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
                Min collection {formatInr(r.minMonthlyCollection)} · Min efficiency{" "}
                {r.minEfficiencyPct}%
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
