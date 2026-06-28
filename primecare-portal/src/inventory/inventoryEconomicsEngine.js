import { resolveInventoryUnitCost } from "@/inventory/resolveInventoryUnitCost.js";

const SLOW_MOVING_DAYS = 60;
const DEAD_INVENTORY_DAYS = 120;
const REORDER_EXPOSURE_RATIO_WARN = 0.25;
const CONCENTRATION_DISTRIBUTOR_WARN = 0.5;
const CONCENTRATION_SKU_WARN = 0.35;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function formatInventoryInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function skuKey(tenantId, productId) {
  return `${str(tenantId) || "hq"}::${str(productId)}`;
}

function normalizeInventoryRow(row = {}) {
  const productId = str(row.productId ?? row.product_id);
  const currentStock = num(row.currentStock ?? row.current_stock);
  const minStock = num(row.minStock ?? row.min_stock);
  const unitCostSource = str(row.unitCostSource);
  const cost = unitCostSource
    ? {
        inventoryUnitCost: row.inventoryUnitCost ?? null,
        productCostPrice: row.productCostPrice ?? null,
        unitCost: num(row.unitCost),
        source: unitCostSource,
      }
    : resolveInventoryUnitCost({
        tenantId: str(row.tenantId ?? row.tenant_id),
        productId,
        currentStock,
        inventoryUnitCost:
          row.inventoryUnitCost ?? row.inventory_unit_cost ?? row.unit_cost ?? null,
        productCostPrice:
          row.productCostPrice ??
          row.product_cost_price ??
          row.costPrice ??
          row.cost_price ??
          null,
      });
  const unitCost = num(cost.unitCost);
  return {
    productId,
    productName: str(row.productName ?? row.product_name ?? row.name) || productId,
    tenantId: str(row.tenantId ?? row.tenant_id),
    currentStock,
    minStock,
    reorderQty: num(row.reorderQty ?? row.reorder_qty),
    inventoryUnitCost: cost.inventoryUnitCost,
    productCostPrice: cost.productCostPrice,
    unitCost,
    unitCostSource: cost.source,
    inventoryValue: Math.round(currentStock * unitCost * 100) / 100,
    isLowStock: minStock > 0 ? currentStock < minStock : currentStock <= 0,
    reorderGapQty: Math.max(0, minStock - currentStock),
    reorderExposureValue: Math.round(Math.max(0, minStock - currentStock) * unitCost * 100) / 100,
  };
}

function buildLastMovementMap(ledgerRows = []) {
  const map = new Map();
  for (const movement of ledgerRows) {
    const productId = str(movement.productId ?? movement.product_id);
    if (!productId) continue;
    const tenantId = str(movement.tenantId ?? movement.tenant_id ?? movement.raw?.tenant_id);
    const key = skuKey(tenantId, productId);
    const createdAtMs = Date.parse(str(movement.createdAt ?? movement.created_at));
    if (!Number.isFinite(createdAtMs)) continue;
    const prev = map.get(key) || 0;
    if (createdAtMs > prev) map.set(key, createdAtMs);
  }
  return map;
}

function daysSinceMovement(lastMovementMs) {
  if (!Number.isFinite(lastMovementMs) || lastMovementMs <= 0) return null;
  return Math.floor((Date.now() - lastMovementMs) / 86400000);
}

function classifyMovementAge(daysSince) {
  if (daysSince == null) return "dead";
  if (daysSince >= DEAD_INVENTORY_DAYS) return "dead";
  if (daysSince >= SLOW_MOVING_DAYS) return "slow";
  return "active";
}

function computeInventoryHealthScore({
  totalInventoryValue = 0,
  deadInventoryValue = 0,
  slowMovingInventoryValue = 0,
  reorderExposure = 0,
  stockConcentrationRisk = false,
}) {
  let score = 100;
  const total = num(totalInventoryValue);
  if (total > 0) {
    const deadRatio = num(deadInventoryValue) / total;
    const slowRatio = num(slowMovingInventoryValue) / total;
    const reorderRatio = num(reorderExposure) / total;
    if (deadRatio >= 0.1) score -= 20;
    if (slowRatio >= 0.15) score -= 10;
    if (reorderRatio >= REORDER_EXPOSURE_RATIO_WARN) score -= 10;
  } else if (num(deadInventoryValue) > 0 || num(slowMovingInventoryValue) > 0) {
    score -= 20;
  }
  if (stockConcentrationRisk) score -= 10;
  return clamp(score);
}

function buildDistributorRollup(rows = [], distributorNames = new Map()) {
  const byTenant = new Map();
  for (const row of rows) {
    const tenantId = str(row.tenantId) || "unscoped";
    const prev = byTenant.get(tenantId) || {
      distributorId: tenantId,
      distributorName: distributorNames.get(tenantId) || tenantId,
      inventoryValue: 0,
      slowMovingInventoryValue: 0,
      deadInventoryValue: 0,
      lowStockCount: 0,
      reorderExposure: 0,
      skuCount: 0,
    };
    prev.inventoryValue += num(row.inventoryValue);
    if (row.movementClass === "slow") prev.slowMovingInventoryValue += num(row.inventoryValue);
    if (row.movementClass === "dead") prev.deadInventoryValue += num(row.inventoryValue);
    if (row.isLowStock) prev.lowStockCount += 1;
    prev.reorderExposure += num(row.reorderExposureValue);
    prev.skuCount += 1;
    byTenant.set(tenantId, prev);
  }

  return [...byTenant.values()]
    .map((row) => ({
      ...row,
      inventoryValueLabel: formatInventoryInr(row.inventoryValue),
      slowMovingInventoryValueLabel: formatInventoryInr(row.slowMovingInventoryValue),
      deadInventoryValueLabel: formatInventoryInr(row.deadInventoryValue),
      reorderExposureLabel: formatInventoryInr(row.reorderExposure),
      inventoryHealthScore: computeInventoryHealthScore({
        totalInventoryValue: row.inventoryValue,
        deadInventoryValue: row.deadInventoryValue,
        slowMovingInventoryValue: row.slowMovingInventoryValue,
        reorderExposure: row.reorderExposure,
        stockConcentrationRisk: false,
      }),
      inventoryHealthLabel: `${computeInventoryHealthScore({
        totalInventoryValue: row.inventoryValue,
        deadInventoryValue: row.deadInventoryValue,
        slowMovingInventoryValue: row.slowMovingInventoryValue,
        reorderExposure: row.reorderExposure,
        stockConcentrationRisk: false,
      })}%`,
    }))
    .sort((a, b) => b.inventoryValue - a.inventoryValue);
}

/**
 * Authoritative inventory economics from inventory rows + ledger movements.
 * @param {object[]} inventoryRows
 * @param {object[]} ledgerRows
 * @param {{ distributorNames?: Map<string,string>, distributorId?: string }} [options]
 */
export function buildInventoryEconomicsModel(inventoryRows = [], ledgerRows = [], options = {}) {
  const distributorId = str(options.distributorId);
  const distributorNames = options.distributorNames || new Map();
  const lastMovementMap = buildLastMovementMap(ledgerRows);

  const normalized = (Array.isArray(inventoryRows) ? inventoryRows : [])
    .map(normalizeInventoryRow)
    .filter((r) => r.productId)
    .filter((r) => !distributorId || r.tenantId === distributorId);

  const enriched = normalized.map((row) => {
    const lastMovementMs = lastMovementMap.get(skuKey(row.tenantId, row.productId)) || null;
    const daysSince = daysSinceMovement(lastMovementMs);
    const movementClass =
      row.currentStock <= 0 ? "active" : classifyMovementAge(daysSince);
    return {
      ...row,
      daysSinceLastMovement: daysSince,
      movementClass,
      isSlowMoving: movementClass === "slow",
      isDeadInventory: movementClass === "dead",
    };
  });

  const totalInventoryValue = enriched.reduce((s, r) => s + num(r.inventoryValue), 0);
  const slowMovingInventoryValue = enriched
    .filter((r) => r.movementClass === "slow")
    .reduce((s, r) => s + num(r.inventoryValue), 0);
  const deadInventoryValue = enriched
    .filter((r) => r.movementClass === "dead")
    .reduce((s, r) => s + num(r.inventoryValue), 0);
  const lowStockExposure = enriched.filter((r) => r.isLowStock).length;
  const reorderExposure = enriched.reduce((s, r) => s + num(r.reorderExposureValue), 0);

  const inventoryValueByDistributor = buildDistributorRollup(enriched, distributorNames);

  const topDistributorShare =
    totalInventoryValue > 0 && inventoryValueByDistributor.length
      ? num(inventoryValueByDistributor[0].inventoryValue) / totalInventoryValue
      : 0;
  const skuValues = enriched
    .map((r) => ({ productId: r.productId, value: r.inventoryValue }))
    .sort((a, b) => b.value - a.value);
  const topSkuShare =
    totalInventoryValue > 0 && skuValues.length
      ? num(skuValues[0].value) / totalInventoryValue
      : 0;
  const stockConcentrationRisk =
    topDistributorShare >= CONCENTRATION_DISTRIBUTOR_WARN ||
    topSkuShare >= CONCENTRATION_SKU_WARN;

  const inventoryHealthScore = computeInventoryHealthScore({
    totalInventoryValue,
    deadInventoryValue,
    slowMovingInventoryValue,
    reorderExposure,
    stockConcentrationRisk,
  });

  return {
    totalInventoryValue,
    totalInventoryValueLabel: formatInventoryInr(totalInventoryValue),
    inventoryValueByDistributor,
    slowMovingInventoryValue,
    slowMovingInventoryValueLabel: formatInventoryInr(slowMovingInventoryValue),
    deadInventoryValue,
    deadInventoryValueLabel: formatInventoryInr(deadInventoryValue),
    lowStockExposure,
    reorderExposure,
    reorderExposureLabel: formatInventoryInr(reorderExposure),
    stockConcentrationRisk,
    topDistributorSharePct: Math.round(topDistributorShare * 100),
    topSkuSharePct: Math.round(topSkuShare * 100),
    inventoryHealthScore,
    inventoryHealthLabel: `${inventoryHealthScore}%`,
    skuCount: enriched.length,
    rows: enriched,
    scopedDistributorId: distributorId || null,
  };
}
