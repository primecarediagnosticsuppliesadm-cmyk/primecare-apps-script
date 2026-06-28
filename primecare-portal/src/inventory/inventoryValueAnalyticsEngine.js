import { formatInventoryInr } from "@/inventory/inventoryEconomicsEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function filterByTenant(rows, tenantFilter, homeTenantId) {
  const list = Array.isArray(rows) ? rows : [];
  if (!tenantFilter || tenantFilter === "all") return list;
  if (tenantFilter === "hq") {
    return homeTenantId ? list.filter((r) => str(r.tenantId) === homeTenantId) : list;
  }
  return list.filter((r) => str(r.tenantId) === tenantFilter);
}

const NO_COST = "Not enough cost data";

/**
 * HQ inventory value analytics from economics model + health read rows.
 * @param {object|null} model - output of buildInventoryEconomicsModel
 * @param {object[]} healthRows - getInventoryHealthRead rows
 * @param {{ tenantFilter?: string, homeTenantId?: string }} [options]
 */
export function buildInventoryValueAnalytics(model, healthRows = [], options = {}) {
  const tenantFilter = options.tenantFilter || "all";
  const homeTenantId = str(options.homeTenantId);

  const econRows = filterByTenant(model?.rows || [], tenantFilter, homeTenantId);
  const health = filterByTenant(healthRows, tenantFilter, homeTenantId);

  const rowsWithCost = econRows.filter((r) => num(r.unitCost) > 0);
  const hasCostData = rowsWithCost.length > 0;

  const totalInventoryValue = hasCostData
    ? econRows.reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;

  const criticalValueAtRisk = hasCostData
    ? econRows
        .filter((r) => r.isLowStock && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;

  const slowMovingValue = hasCostData
    ? econRows
        .filter((r) => r.movementClass === "slow" && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;

  const deadStockValue = hasCostData
    ? econRows
        .filter((r) => r.movementClass === "dead" && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;

  const stockoutRiskCount = health.filter((r) => {
    const urgency = str(r.urgency).toLowerCase();
    const days = r.projectedStockoutDays;
    if (urgency === "critical") return true;
    return days != null && num(days) <= 7;
  }).length;

  const forecastRows = health.filter(
    (r) => r.projectedStockoutDays != null && num(r.projectedStockoutDays) > 0
  );
  const nearestStockoutDays =
    forecastRows.length > 0
      ? Math.min(...forecastRows.map((r) => num(r.projectedStockoutDays)))
      : null;

  const reorderExposure = hasCostData
    ? econRows.reduce((s, r) => s + num(r.reorderExposureValue), 0)
    : null;

  const lowStockSkuCount = econRows.filter((r) => r.isLowStock).length;

  if (hasCostData) {
    const rowValueSum = econRows.reduce((s, r) => s + num(r.inventoryValue), 0);
    const stockTimesCostSum = econRows.reduce(
      (s, r) => s + num(r.currentStock) * num(r.unitCost),
      0
    );
    const skuKeys = econRows.map((r) => `${str(r.tenantId)}::${str(r.productId)}`);
    const uniqueSkuKeys = new Set(skuKeys);
    console.log("[inventoryValuationReconciliation]", {
      tenantFilter,
      homeTenantId,
      skuCount: econRows.length,
      uniqueSkuCount: uniqueSkuKeys.size,
      duplicateSkus: skuKeys.length - uniqueSkuKeys.size,
      rowValueSum: Math.round(rowValueSum * 100) / 100,
      stockTimesCostSum: Math.round(stockTimesCostSum * 100) / 100,
      totalInventoryValue: Math.round(num(totalInventoryValue) * 100) / 100,
      reconciled:
        Math.abs(rowValueSum - num(totalInventoryValue)) <= 0.01 &&
        Math.abs(stockTimesCostSum - num(totalInventoryValue)) <= 0.01,
      criticalValueAtRisk: Math.round(num(criticalValueAtRisk) * 100) / 100,
      slowMovingValue: Math.round(num(slowMovingValue) * 100) / 100,
      deadStockValue: Math.round(num(deadStockValue) * 100) / 100,
      hasCostData,
    });
  }

  return {
    hasCostData,
    totalInventoryValue,
    totalInventoryValueLabel: hasCostData ? formatInventoryInr(totalInventoryValue) : NO_COST,
    criticalValueAtRisk,
    criticalValueAtRiskLabel: hasCostData ? formatInventoryInr(criticalValueAtRisk) : NO_COST,
    slowMovingValue,
    slowMovingValueLabel: hasCostData ? formatInventoryInr(slowMovingValue) : NO_COST,
    deadStockValue,
    deadStockValueLabel: hasCostData ? formatInventoryInr(deadStockValue) : NO_COST,
    stockoutRiskCount,
    stockoutRiskLabel:
      stockoutRiskCount > 0
        ? `${stockoutRiskCount} SKU${stockoutRiskCount === 1 ? "" : "s"} at risk`
        : health.length === 0
          ? "No inventory health data"
          : "No critical stockouts flagged",
    nearestStockoutDays,
    reorderForecastLabel:
      nearestStockoutDays != null
        ? `Nearest stockout ~${nearestStockoutDays} day${nearestStockoutDays === 1 ? "" : "s"}`
        : forecastRows.length === 0
          ? "Reorder forecast unavailable — no recent consumption"
          : "Reorder forecast unavailable",
    reorderExposure,
    reorderExposureLabel: hasCostData ? formatInventoryInr(reorderExposure) : NO_COST,
    lowStockSkuCount,
    skuCount: econRows.length,
    deadSlowDerivable: hasCostData && (slowMovingValue > 0 || deadStockValue > 0 || econRows.some((r) => r.movementClass)),
  };
}
