import React from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, KpiCard, KpiCardGrid } from "@/components/ux";
import {
  allowedLifecycleTransitions,
  contractExpiryState,
  lifecycleActionLabel,
  lifecycleStatusLabel,
  lifecycleStatusVariant,
} from "@/distributor/distributorLifecycleEngine.js";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp } from "lucide-react";

const HEALTH_VARIANT = { Healthy: "success", Watch: "warning", Risk: "danger" };

export function DashboardPanel({ dashboard, comparison = [], onSelect }) {
  if (!dashboard) return null;
  const d = dashboard;

  return (
    <div className="space-y-4">
      <KpiCardGrid>
        <KpiCard title="Total distributors" value={d.totalDistributors} />
        <KpiCard title="Active" value={d.activeDistributors} />
        <KpiCard title="Suspended" value={d.suspendedDistributors} />
        <KpiCard title="Monthly revenue" value={d.monthlyDistributorRevenueLabel} />
        <KpiCard title="Collections" value={d.collectionsFromDistributors} />
        <KpiCard
          title="Top distributor"
          value={d.topDistributorByRevenue?.name || "—"}
          subtitle={d.topDistributorByRevenue?.revenueLabel}
        />
        <KpiCard title="At-risk" value={d.atRiskCount} />
        <KpiCard
          title="Contracts expiring"
          value={`30d: ${d.contractsExpiring30} · 60d: ${d.contractsExpiring60} · 90d: ${d.contractsExpiring90}`}
        />
      </KpiCardGrid>

      {d.billingRollup ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <p className="font-semibold text-slate-900">PrimeCare billing rollup</p>
          <p className="mt-1 text-slate-700">
            Due {d.billingRollup.totalDueLabel} · Collected {d.billingRollup.totalCollectedLabel} ·
            Outstanding {d.billingRollup.totalOutstandingLabel}
            {d.billingRollup.overdueCount ? ` · ${d.billingRollup.overdueCount} overdue` : ""}
          </p>
        </div>
      ) : null}

      <ComparisonPanel rows={comparison} onSelect={onSelect} title="Distributor comparison" />
    </div>
  );
}

export function ComparisonPanel({ rows = [], onSelect, title = "Comparison" }) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No distributors to compare yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase text-slate-500">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-1.5">Distributor</th>
              <th className="px-2 py-1.5">Territory</th>
              <th className="px-2 py-1.5">Labs</th>
              <th className="px-2 py-1.5">Revenue</th>
              <th className="px-2 py-1.5">Collections</th>
              <th className="px-2 py-1.5">Outstanding</th>
              <th className="px-2 py-1.5">Health</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Next action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.distributorId}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() => onSelect?.(row.distributorId)}
              >
                <td className="px-2 py-1.5 font-medium">{row.distributor}</td>
                <td className="px-2 py-1.5">{row.territory}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.labs}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.revenueLabel}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.collections}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.outstandingLabel}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.health}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge variant="neutral" label={row.status} />
                </td>
                <td className="px-2 py-1.5 text-slate-600">{row.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BillingPanel({ billingRows = [], onSelect }) {
  if (!billingRows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No distributor billing records yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-slate-500">
            <th className="px-2 py-1.5">Distributor</th>
            <th className="px-2 py-1.5">Billing model</th>
            <th className="px-2 py-1.5">Amount due</th>
            <th className="px-2 py-1.5">Collected</th>
            <th className="px-2 py-1.5">Outstanding</th>
            <th className="px-2 py-1.5">Due date</th>
            <th className="px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {billingRows.map((row) => (
            <tr
              key={row.distributorId}
              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              onClick={() => onSelect?.(row.distributorId)}
            >
              <td className="px-2 py-1.5 font-medium">{row.distributorName}</td>
              <td className="px-2 py-1.5">{row.billingModelLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.amountDueLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.collectedLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.outstandingLabel}</td>
              <td className="px-2 py-1.5">{row.dueDate || "—"}</td>
              <td className="px-2 py-1.5">
                <StatusBadge
                  variant={
                    row.paymentStatus === "paid"
                      ? "success"
                      : row.paymentStatus === "overdue"
                        ? "danger"
                        : "warning"
                  }
                  label={row.paymentStatus}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePanel({ performance, billing }) {
  if (!performance) return null;
  const p = performance;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          variant={lifecycleStatusVariant(p.lifecycleStatus)}
          label={lifecycleStatusLabel(p.lifecycleStatus)}
        />
        {p.contractExpired || p.contractExpiryLabel ? (
          <span className="flex items-center gap-1 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {p.contractExpired ? "Expired · Renewal needed" : p.contractExpiryLabel}
          </span>
        ) : null}
        {!p.canOperate ? (
          <span className="text-xs text-red-700">Operations restricted for this status</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
        {[
          ["Labs", p.labs],
          ["Active labs", p.activeLabs],
          ["Orders", p.orders],
          ["Collections", p.collections],
          ["Contracts", p.contracts],
          ["Agents", p.agents],
          ["Commission payouts", p.commissionPayouts],
          ["Collection efficiency", `${p.collectionEfficiencyPct}%`],
        ].map(([label, val]) => (
          <div key={label} className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">{label}</p>
            <p className="font-semibold tabular-nums">{val}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-2 text-xs">
          <p className="flex items-center gap-1 text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" /> Revenue contribution
          </p>
          <p className="text-sm font-bold">{p.revenueContributionPct}%</p>
          <p className="text-slate-600">{p.revenueLabel}</p>
        </div>
        <div className="rounded-lg border bg-white p-2 text-xs">
          <p className="text-slate-500">Health score</p>
          <p className="text-sm font-bold tabular-nums">{p.healthScore}</p>
          <StatusBadge variant={HEALTH_VARIANT[p.healthBand] || "neutral"} label={p.healthBand} />
        </div>
        {billing ? (
          <div className="rounded-lg border bg-white p-2 text-xs">
            <p className="text-slate-500">Amount due to PrimeCare</p>
            <p className="text-sm font-bold">{billing.amountDueLabel}</p>
            <p className="text-slate-600">Outstanding {billing.outstandingLabel}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LifecycleActionsPanel({ lifecycleStatus, onAction, busy = false }) {
  const transitions = allowedLifecycleTransitions(lifecycleStatus);
  const actions = [];
  if (transitions.includes("active")) {
    actions.push(lifecycleStatus === "suspended" || lifecycleStatus === "deactivated" ? "reactivate" : "activate");
  }
  if (transitions.includes("suspended")) actions.push("suspend");
  if (transitions.includes("deactivated")) actions.push("deactivate");

  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === "deactivate" ? "outline" : "default"}
          disabled={busy}
          onClick={() => onAction?.(action)}
        >
          {lifecycleActionLabel(action)}
        </Button>
      ))}
    </div>
  );
}

export function OperationRestrictionBanner({ scope, registryRow }) {
  if (!scope || scope.canOperate) return null;
  const config = registryRow?.config || {};
  const expiry = contractExpiryState(config);
  const msg = expiry.expired
    ? `${scope.tenantName} contract expired — renewal needed before operations resume.`
    : `${scope.tenantName} is ${lifecycleStatusLabel(scope.lifecycleStatus)} — orders and collections are blocked.`;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", "border-amber-300 bg-amber-50 text-amber-950")}>
      {msg}
    </div>
  );
}
