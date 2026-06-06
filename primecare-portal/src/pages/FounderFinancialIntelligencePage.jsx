import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import { buildFounderFinancialIntelligenceModel } from "@/founder/founderFinancialIntelligenceEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  RefreshCw,
  IndianRupee,
  TrendingUp,
  Wallet,
  Building2,
  AlertTriangle,
} from "lucide-react";

const RISK_VARIANT = {
  High: "danger",
  Medium: "warning",
  Low: "info",
};

function MetricTile({ label, value, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children, className }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-3", className)}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Founder Financial Intelligence P1 — HQ consolidated financial command layer (executive only).
 */
export default function FounderFinancialIntelligencePage({ setActivePage = null, currentUser = null }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadFounderFinancialIntelligenceData(currentUser);
      setModel(buildFounderFinancialIntelligenceModel(data));
    } catch (err) {
      setError(err?.message || "Failed to load financial intelligence");
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      founderFinancialIntelligence: true,
      billingLoaded: model.loadStatus?.billing?.ok,
      commissionsLoaded: model.loadStatus?.commissions?.ok,
      contractsLoaded: model.loadStatus?.contracts?.ok,
      collectionsLoaded: model.loadStatus?.collections?.ok,
      snapshotPresent: Boolean(model.hqSnapshot),
      distributorRowCount: model.distributorEconomics?.length ?? 0,
      reconciliationValid: model.reconciliation?.valid,
      riskCount: model.risks?.length ?? 0,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Founder Financial Intelligence",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  if (loading) return <PageSkeleton rows={10} />;
  if (error) {
    return (
      <div className="p-4 text-sm text-red-700">
        <p>{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!model) return null;

  const { hqSnapshot, revenueIntelligence, collectionsCash, hqObligations, distributorEconomics, risks } =
    model;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden />
            Founder Financial Intelligence
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            HQ consolidated financial view across PrimeCare and all distributors.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <Section title="HQ Snapshot" icon={IndianRupee}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Realized revenue (MTD)" value={hqSnapshot.realizedRevenueMtdLabel} />
          <MetricTile label="Platform billing collected" value={hqSnapshot.platformBillingCollectedLabel} />
          <MetricTile label="Billing outstanding" value={hqSnapshot.billingOutstandingLabel} />
          <MetricTile label="Commission liability" value={hqSnapshot.commissionLiabilityLabel} />
          <MetricTile label="Commission paid" value={hqSnapshot.commissionPaidLabel} />
          <MetricTile label="AR outstanding" value={hqSnapshot.arOutstandingLabel} />
        </div>
      </Section>

      <Section title="Revenue intelligence" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <MetricTile label="Revenue under contract" value={revenueIntelligence.revenueUnderContractLabel} />
          <MetricTile label="Monthly committed" value={revenueIntelligence.monthlyCommittedLabel} />
          <MetricTile label="Contract pipeline value" value={revenueIntelligence.pipelineValueLabel} />
          <MetricTile label="Revenue gap to target" value={revenueIntelligence.revenueGapLabel} />
          <MetricTile label="Active contracts" value={String(revenueIntelligence.activeContracts)} />
          <MetricTile label="Expiring in 90 days" value={String(revenueIntelligence.expiring90Count)} />
          <MetricTile label="Contract health" value={`${revenueIntelligence.contractHealthScore}%`} />
          <MetricTile label="Pipeline count" value={String(revenueIntelligence.pipelineCount)} />
        </div>
        {revenueIntelligence.topLabsByRevenue?.length > 0 ? (
          <p className="mt-2 text-[10px] text-slate-600">
            Top lab: {revenueIntelligence.topLabsByRevenue[0].labName} (
            {`₹${Number(revenueIntelligence.topLabsByRevenue[0].revenue).toLocaleString("en-IN")}`})
          </p>
        ) : null}
      </Section>

      <Section title="Collections & cash" icon={Wallet}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricTile label="Total outstanding" value={collectionsCash.totalOutstanding} />
          <MetricTile label="Total overdue" value={collectionsCash.totalOverdue} />
          <MetricTile
            label="Recovery %"
            value={collectionsCash.recoveryPct != null ? `${collectionsCash.recoveryPct}%` : "—"}
          />
          <MetricTile label="Blocked accounts" value={String(collectionsCash.blockedCount)} />
          <MetricTile label="Top debtors tracked" value={String(collectionsCash.topDebtorsCount)} />
        </div>
        {setActivePage ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0 text-xs"
            onClick={() => setActivePage("risk")}
          >
            Credit &amp; Risk
          </Button>
        ) : null}
      </Section>

      <Section title="HQ obligations" icon={IndianRupee}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Commission liability" value={hqObligations.commissionLiabilityLabel} />
          <MetricTile label="Commission approved" value={hqObligations.commissionApprovedLabel} />
          <MetricTile label="Commission paid" value={hqObligations.commissionPaidLabel} />
          <MetricTile label="Commission outstanding" value={hqObligations.commissionOutstandingLabel} />
        </div>
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
          <p className="font-semibold">Net HQ spread (informational)</p>
          <p className="text-lg font-bold tabular-nums">{hqObligations.netHqSpreadLabel}</p>
          <p className="text-[10px] opacity-80">{hqObligations.netHqSpreadNote}</p>
        </div>
      </Section>

      <Section title="Distributor economics" icon={Building2}>
        {distributorEconomics.length === 0 ? (
          <p className="text-xs text-slate-500">No distributors in registry.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-[10px]">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Distributor</th>
                  <th className="px-2 py-1.5 font-semibold">Revenue</th>
                  <th className="px-2 py-1.5 font-semibold">Collections</th>
                  <th className="px-2 py-1.5 font-semibold">Billing due</th>
                  <th className="px-2 py-1.5 font-semibold">Billing collected</th>
                  <th className="px-2 py-1.5 font-semibold">Billing out.</th>
                  <th className="px-2 py-1.5 font-semibold">Comm. liability</th>
                  <th className="px-2 py-1.5 font-semibold">Comm. paid</th>
                  <th className="px-2 py-1.5 font-semibold">Contract rev.</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {distributorEconomics.map((row) => (
                  <tr key={row.distributorId} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-1.5 font-medium text-slate-900">{row.name}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.revenueLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.collectionsLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.billingDueLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.billingCollectedLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.billingOutstandingLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.commissionLiabilityLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.commissionPaidLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.contractRevenueLabel}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge variant="neutral" label={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {setActivePage ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0 text-xs"
            onClick={() => setActivePage("distributorOs")}
          >
            Distributor OS
          </Button>
        ) : null}
      </Section>

      <Section title="Financial risks" icon={AlertTriangle}>
        {risks.length === 0 ? (
          <p className="text-xs text-slate-500">No financial risk alerts from current data.</p>
        ) : (
          <ul className="space-y-2">
            {risks.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-2 rounded-lg border bg-white p-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900">{r.title}</p>
                  <p className="text-slate-600">{r.detail}</p>
                </div>
                <StatusBadge variant={RISK_VARIANT[r.severity] || "neutral"} label={r.severity} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
