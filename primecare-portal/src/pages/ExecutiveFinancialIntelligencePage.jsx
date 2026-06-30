import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton, StatusBadge, KpiCard, KpiCardGrid } from "@/components/ux";
import { loadExecutiveFinancialIntelligenceData } from "@/founder/executiveFinancialIntelligenceData.js";
import { buildExecutiveFinancialIntelligenceModel } from "@/founder/executiveFinancialIntelligenceEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  RefreshCw,
  IndianRupee,
  Wallet,
  ShoppingCart,
  Truck,
  Package,
  Building2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

const ALERT_VARIANT = {
  High: "danger",
  Medium: "warning",
  Low: "info",
};

function MetricTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Section({ title, icon: Icon, children, className }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-4", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-4 w-4 text-indigo-600" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function LabTable({ columns, rows, emptyLabel = "No data" }) {
  if (!rows?.length) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full text-left text-[11px]">
        <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cn("px-2 py-2", col.align === "right" && "text-right")}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.labId || row.distributorId || idx} className="border-b border-slate-100 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn("px-2 py-1.5 text-slate-800", col.align === "right" && "text-right tabular-nums")}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueTrendChart({ points = [] }) {
  const max = Math.max(...points.map((p) => p.revenue), 1);
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        14-day fulfilled revenue trend
      </p>
      <div className="flex h-28 items-end gap-1">
        {points.map((p) => (
          <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-indigo-500/80"
              style={{ height: `${Math.max(4, (p.revenue / max) * 100)}%` }}
              title={`${p.label}: ${p.revenueLabel}`}
            />
            <span className="truncate text-[8px] text-slate-400">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Executive Financial Intelligence — read-only HQ analytics dashboard.
 */
export default function ExecutiveFinancialIntelligencePage({
  setActivePage = null,
  currentUser = null,
}) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadExecutiveFinancialIntelligenceData(currentUser);
      setModel(buildExecutiveFinancialIntelligenceModel(data));
    } catch (err) {
      setError(err?.message || "Failed to load executive financial intelligence");
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
      executiveFinancialIntelligence: true,
      revenueToday: model.revenue?.today,
      outstanding: model.collections?.outstandingReceivables,
      alertCount: model.alerts?.length ?? 0,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Executive Financial Intelligence",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  if (loading) return <PageSkeleton rows={12} />;
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

  const { revenue, collections, orders, logistics, inventory, labPerformance, alerts } = model;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 pb-10">
      <PageHeader
        title="Executive Financial Intelligence"
        subtitle="Read-only HQ analytics — derived from existing operational and financial data."
        icon={BarChart3}
        rightAction={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <Section title="Revenue" icon={IndianRupee}>
        <KpiCardGrid columns={4} className="mb-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Today's Revenue" value={revenue.todayLabel} icon={IndianRupee} />
          <KpiCard title="This Week" value={revenue.thisWeekLabel} icon={TrendingUp} />
          <KpiCard title="This Month" value={revenue.thisMonthLabel} icon={TrendingUp} />
          <KpiCard title="Year To Date" value={revenue.yearToDateLabel} icon={BarChart3} />
        </KpiCardGrid>
        <RevenueTrendChart points={revenue.trend} />
        <p className="mt-2 text-[10px] text-slate-500">
          Fulfilled-order revenue only (same rule as Admin dashboard). Total fulfilled:{" "}
          {revenue.totalFulfilledRevenueLabel}
        </p>
      </Section>

      <Section title="Collections" icon={Wallet}>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Outstanding receivables" value={collections.outstandingReceivablesLabel} />
          <MetricTile label="Collected this month" value={collections.collectedThisMonthLabel} />
          <MetricTile label="Avg collection days" value={collections.averageCollectionDaysLabel} />
          <MetricTile
            label="Recovery %"
            value={collections.recoveryPct != null ? `${collections.recoveryPct}%` : "—"}
          />
        </div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Largest outstanding labs
        </p>
        <LabTable
          columns={[
            { key: "labName", label: "Lab" },
            { key: "outstandingLabel", label: "Outstanding", align: "right" },
            { key: "overdueDays", label: "Overdue days", align: "right" },
          ]}
          rows={collections.largestOutstandingLabs}
        />
      </Section>

      <Section title="Orders" icon={ShoppingCart}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricTile label="Orders today" value={String(orders.ordersToday)} />
          <MetricTile label="Pending orders" value={String(orders.pendingOrders)} />
          <MetricTile label="Fulfilled orders" value={String(orders.fulfilledOrders)} />
          <MetricTile label="Cancelled orders" value={String(orders.cancelledOrders)} />
          <MetricTile label="Average order value" value={orders.averageOrderValueLabel} />
        </div>
      </Section>

      <Section title="Logistics" icon={Truck}>
        <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Est. Delivery Revenue"
            value={logistics.estimatedDeliveryRevenueLabel}
            subtitle="Operational quotes only"
          />
          <KpiCard title="Delivered Today" value={logistics.deliveredToday} />
          <KpiCard title="Pending Dispatch" value={logistics.pendingDispatch} />
          <KpiCard title="Failed Deliveries" value={logistics.failedDeliveries} />
          <KpiCard title="Customer Pickups" value={logistics.customerPickups} />
        </KpiCardGrid>
        {setActivePage ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0 text-xs"
            onClick={() => setActivePage("logisticsDelivery")}
          >
            Open Logistics &amp; Delivery
          </Button>
        ) : null}
      </Section>

      <Section title="Inventory" icon={Package}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Inventory value" value={inventory.inventoryValueLabel} />
          <MetricTile label="Slow moving inventory" value={inventory.slowMovingInventoryLabel} />
          <MetricTile label="Critical stock SKUs" value={String(inventory.criticalStock)} />
          <MetricTile label="Projected reorder cost" value={inventory.projectedReorderCostLabel} />
        </div>
        {setActivePage ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0 text-xs"
            onClick={() => setActivePage("inventory")}
          >
            Open Inventory
          </Button>
        ) : null}
      </Section>

      <Section title="Lab Performance" icon={Building2}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Top revenue labs</p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                { key: "revenueLabel", label: "Revenue", align: "right" },
              ]}
              rows={labPerformance.topRevenueLabs}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Top collection labs</p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                { key: "collectedLabel", label: "Collected", align: "right" },
              ]}
              rows={labPerformance.topCollectionLabs}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Highest growth labs</p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                {
                  key: "growthPct",
                  label: "MoM growth",
                  align: "right",
                  render: (r) => `${r.growthPct}%`,
                },
                { key: "currentRevenueLabel", label: "This month", align: "right" },
              ]}
              rows={labPerformance.highestGrowthLabs}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Most delayed payment</p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                { key: "overdueDays", label: "Overdue days", align: "right" },
                { key: "outstandingLabel", label: "Outstanding", align: "right" },
              ]}
              rows={labPerformance.mostDelayedPaymentLabs}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Largest delivery volume</p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                { key: "shipmentCount", label: "Shipments", align: "right" },
              ]}
              rows={labPerformance.largestDeliveryVolumeLabs}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">
              Strongest lab net position
            </p>
            <LabTable
              columns={[
                { key: "labName", label: "Lab" },
                { key: "netPositionLabel", label: "Collected − outstanding", align: "right" },
              ]}
              rows={labPerformance.profitableLabs}
            />
          </div>
        </div>
      </Section>

      <Section title="Executive Alerts" icon={AlertTriangle}>
        {alerts.length === 0 ? (
          <p className="text-xs text-slate-500">No executive alerts from current data.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-start justify-between gap-2 rounded-lg border bg-white p-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900">{alert.title}</p>
                  <p className="text-slate-600">{alert.detail}</p>
                </div>
                <StatusBadge variant={ALERT_VARIANT[alert.severity] || "neutral"} label={alert.severity} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
