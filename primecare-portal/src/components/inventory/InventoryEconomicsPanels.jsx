import React from "react";
import { cn } from "@/lib/utils";

function MetricTile({ label, value, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function InventoryEconomicsMetricsGrid({ economics }) {
  if (!economics) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <MetricTile label="Inventory value" value={economics.totalInventoryValueLabel} />
      <MetricTile label="Slow inventory" value={economics.slowMovingInventoryValueLabel} />
      <MetricTile label="Dead inventory" value={economics.deadInventoryValueLabel} />
      <MetricTile label="Reorder exposure" value={economics.reorderExposureLabel} />
      <MetricTile label="Inventory health" value={economics.inventoryHealthLabel} />
    </div>
  );
}

export function InventoryEconomicsSummaryPanel({ economics, compact = false }) {
  if (!economics) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <p className="font-semibold text-slate-900">Inventory economics</p>
      <dl className={cn("mt-2 grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-3")}>
        <div>
          <dt className="text-slate-500">Inventory value</dt>
          <dd className="font-medium tabular-nums">{economics.totalInventoryValueLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Low stock count</dt>
          <dd className="font-medium tabular-nums">{economics.lowStockExposure}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Slow moving value</dt>
          <dd className="font-medium tabular-nums">{economics.slowMovingInventoryValueLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reorder exposure</dt>
          <dd className="font-medium tabular-nums">{economics.reorderExposureLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Inventory health</dt>
          <dd className="font-medium tabular-nums">{economics.inventoryHealthLabel}</dd>
        </div>
      </dl>
    </div>
  );
}

export function InventoryEconomicsRiskCards({ economics }) {
  if (!economics) return null;
  const cards = [];
  if (num(economics.deadInventoryValue) > 0) {
    cards.push({
      id: "dead-inventory",
      title: "Dead inventory detected",
      detail: `${economics.deadInventoryValueLabel} with no movement in 120+ days`,
      severity: "High",
    });
  }
  if (num(economics.lowStockExposure) > 0) {
    cards.push({
      id: "low-stock",
      title: "Low stock exposure",
      detail: `${economics.lowStockExposure} SKU(s) below reorder point`,
      severity: "Medium",
    });
  }
  if (
    num(economics.reorderExposure) > 0 &&
    num(economics.totalInventoryValue) > 0 &&
    num(economics.reorderExposure) / num(economics.totalInventoryValue) >= 0.25
  ) {
    cards.push({
      id: "reorder-exposure",
      title: "Reorder exposure above threshold",
      detail: `${economics.reorderExposureLabel} estimated to restore low-stock SKUs`,
      severity: "High",
    });
  }
  if (!cards.length) {
    return <p className="text-[11px] text-slate-500">No elevated inventory economics risks.</p>;
  }
  return (
    <ul className="space-y-2">
      {cards.map((card) => (
        <li key={card.id} className="rounded-lg border bg-white p-2 text-[11px]">
          <p className="font-semibold text-slate-900">{card.title}</p>
          <p className="text-slate-600">{card.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
