import { num, str } from "./primitives.js";

/** Bucket counts from public.inventory-style rows (admin dashboard fallback path). */
export function rollupInventoryTableRows(rows) {
  let criticalItems = 0;
  let reorderItems = 0;
  let healthyItems = 0;

  for (const row of rows || []) {
    const currentStock = num(row.current_stock ?? row.currentStock ?? 0);
    const minStock = num(row.min_stock ?? row.minStock ?? 0);
    if (currentStock <= 0) criticalItems += 1;
    else if (minStock > 0 && currentStock < minStock) reorderItems += 1;
    else healthyItems += 1;
  }

  return {
    totalSkus: (rows || []).length,
    criticalItems,
    reorderItems,
    healthyItems,
  };
}

/**
 * Stats from mapped v_stock_dashboard rows (PrimeCare_stockHealth discriminator).
 */
export function rollupStockDashboardMappedItems(inventory) {
  return {
    totalSkus: inventory.length,
    criticalItems: inventory.filter((x) => x.stockHealth === "Critical").length,
    reorderItems: inventory.filter((x) => x.stockHealth === "Reorder").length,
    healthyItems: inventory.filter((x) => x.stockHealth === "Healthy").length,
    totalSuggestedOrderQty: inventory.reduce(
      (sum, x) => sum + (x.stockHealth !== "Healthy" ? x.reorderQty : 0),
      0
    ),
  };
}

/** Executive near-stockout from inventory stats (Supabase dashboard rule). */
export function productsNearStockoutFromInventoryStats(stockStats) {
  return num(stockStats.criticalItems) + num(stockStats.reorderItems);
}

/**
 * Admin merge-layer MAX(forecast urgency, inventory buckets) — unchanged behavior.
 */
export function computeNearStockoutMergeDerived({ forecastRows, stockStats }) {
  const urgentForecastCount = (forecastRows || []).filter((r) => {
    const u = str(r.urgency).toLowerCase();
    return u === "critical" || u === "high";
  }).length;
  const bucketSum = num(stockStats.criticalItems || 0) + num(stockStats.reorderItems || 0);
  return Math.max(urgentForecastCount, bucketSum);
}
