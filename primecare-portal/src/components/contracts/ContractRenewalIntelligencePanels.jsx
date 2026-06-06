import React from "react";
import { StatusBadge } from "@/components/ux";
import { RENEWAL_RISK_LEVELS } from "@/contracts/contractRenewalIntelligenceEngine.js";
import { cn } from "@/lib/utils";

const RISK_VARIANT = {
  [RENEWAL_RISK_LEVELS.CRITICAL]: "danger",
  [RENEWAL_RISK_LEVELS.HIGH]: "warning",
  [RENEWAL_RISK_LEVELS.MEDIUM]: "info",
  [RENEWAL_RISK_LEVELS.HEALTHY]: "success",
};

function MetricTile({ label, value, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function ContractRenewalMetricsGrid({ renewal }) {
  if (!renewal) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <MetricTile label="Expiring (30d)" value={String(renewal.expiring30Count)} />
      <MetricTile label="Expiring (60d)" value={String(renewal.expiring60Count)} />
      <MetricTile label="Expiring (90d)" value={String(renewal.expiring90Count)} />
      <MetricTile label="Revenue at risk" value={renewal.revenueAtRiskLabel} />
      <MetricTile label="Monthly rev. at risk" value={renewal.committedRevenueAtRiskLabel} />
      <MetricTile label="Renewal health" value={renewal.renewalHealthLabel} />
    </div>
  );
}

export function ContractRenewalSummaryPanel({ renewal, compact = false }) {
  if (!renewal) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">Renewal summary</p>
        <StatusBadge
          variant={RISK_VARIANT[renewal.renewalRiskLevel] || "neutral"}
          label={renewal.renewalRiskLevel}
        />
      </div>
      <dl className={cn("mt-2 grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-4")}>
        <div>
          <dt className="text-slate-500">Active contracts</dt>
          <dd className="font-medium tabular-nums">{renewal.activeContracts}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expiring soon</dt>
          <dd className="font-medium tabular-nums">{renewal.expiringSoon}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Revenue at risk</dt>
          <dd className="font-medium tabular-nums">{renewal.revenueAtRiskLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Renewal health</dt>
          <dd className="font-medium tabular-nums">{renewal.renewalHealthLabel}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ContractRenewalInterventionQueue({ queue = [], maxRows = 20 }) {
  const rows = queue.slice(0, maxRows);
  if (!rows.length) {
    return <p className="text-xs text-slate-500">No contracts in the renewal intervention window.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full text-left text-[10px]">
        <thead className="border-b bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Contract</th>
            <th className="px-2 py-1.5 font-semibold">Distributor</th>
            <th className="px-2 py-1.5 font-semibold">Lab</th>
            <th className="px-2 py-1.5 font-semibold">Expiry</th>
            <th className="px-2 py-1.5 font-semibold">Days left</th>
            <th className="px-2 py-1.5 font-semibold">Monthly rev.</th>
            <th className="px-2 py-1.5 font-semibold">Rev. at risk</th>
            <th className="px-2 py-1.5 font-semibold">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.contractId || row.contractNumber} className="border-b border-slate-100 last:border-0">
              <td className="px-2 py-1.5 font-medium text-slate-900">{row.contractNumber}</td>
              <td className="px-2 py-1.5">{row.distributorName}</td>
              <td className="px-2 py-1.5">{row.labName}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.expiryDate}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.daysRemaining}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.monthlyRevenueLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.revenueAtRiskLabel}</td>
              <td className="px-2 py-1.5">
                <StatusBadge variant={RISK_VARIANT[row.riskLevel] || "neutral"} label={row.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DistributorRenewalHealthTable({ rows = [] }) {
  if (!rows.length) {
    return <p className="text-xs text-slate-500">No distributor contract activity.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full text-left text-[10px]">
        <thead className="border-b bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Distributor</th>
            <th className="px-2 py-1.5 font-semibold">Active</th>
            <th className="px-2 py-1.5 font-semibold">Expiring</th>
            <th className="px-2 py-1.5 font-semibold">Revenue at risk</th>
            <th className="px-2 py-1.5 font-semibold">Renewal health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.distributorId} className="border-b border-slate-100 last:border-0">
              <td className="px-2 py-1.5 font-medium text-slate-900">{row.distributorName}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.activeContracts}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.expiringContracts}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.revenueAtRiskLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.renewalHealthLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
