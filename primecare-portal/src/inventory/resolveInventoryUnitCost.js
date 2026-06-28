function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optionalPositiveCost(value) {
  if (value == null || value === "") return null;
  const n = num(value);
  return n > 0 ? n : null;
}

/**
 * Resolve inventory valuation unit cost without inventing estimates.
 * Priority: inventory unit cost → products.cost_price → missing.
 *
 * @param {{
 *   tenantId?: string,
 *   productId?: string,
 *   currentStock?: number,
 *   inventoryUnitCost?: number|null,
 *   productCostPrice?: number|null,
 *   logQa?: boolean,
 * }} [params]
 */
export function resolveInventoryUnitCost({
  tenantId = "",
  productId = "",
  currentStock = 0,
  inventoryUnitCost = null,
  productCostPrice = null,
  logQa = true,
} = {}) {
  const inventoryCost = optionalPositiveCost(inventoryUnitCost);
  const productCost = optionalPositiveCost(productCostPrice);

  let resolvedUnitCost = null;
  let source = "missing";

  if (inventoryCost != null) {
    resolvedUnitCost = inventoryCost;
    source = "inventory";
  } else if (productCost != null) {
    resolvedUnitCost = productCost;
    source = "product";
  }

  const stock = num(currentStock);
  const inventoryValue =
    resolvedUnitCost != null ? Math.round(stock * resolvedUnitCost * 100) / 100 : 0;

  const payload = {
    tenantId: String(tenantId ?? "").trim(),
    productId: String(productId ?? "").trim(),
    currentStock: stock,
    inventoryUnitCost: inventoryCost,
    productCostPrice: productCost,
    resolvedUnitCost,
    source,
    inventoryValue,
  };

  if (logQa) {
    console.log("[inventoryValuation]", payload);
  }

  return {
    inventoryUnitCost: inventoryCost,
    productCostPrice: productCost,
    resolvedUnitCost,
    unitCost: resolvedUnitCost ?? 0,
    source,
    inventoryValue,
  };
}
