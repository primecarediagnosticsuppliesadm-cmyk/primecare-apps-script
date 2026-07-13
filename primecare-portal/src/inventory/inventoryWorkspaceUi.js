/**
 * Inventory workspace presentation helpers (Sprint 1C).
 * No stock math, ledger, routing, or write-path changes.
 */

function str(value) {
  return String(value ?? "").trim();
}

export const INVENTORY_WORKSPACE_PRIMARY_QUESTION = "What inventory work should I do now?";

/**
 * One-line expected action for the selected SKU (discoverability).
 * Uses existing stockHealth labels only — no new prioritization.
 */
export function getInventoryExpectedActionCopy({
  stockHealth = "",
  currentStock = 0,
  minStock = 0,
  reorderQty = 0,
} = {}) {
  const health = str(stockHealth);
  const onHand = Number(currentStock) || 0;
  const min = Number(minStock) || 0;
  const reorder = Number(reorderQty) || 0;

  if (health === "Critical") {
    return {
      action: "Receive stock or create a purchase order",
      reason: `SKU is Critical — on hand ${onHand} vs min ${min}.`,
    };
  }
  if (health === "Reorder") {
    return {
      action: "Review reorder and create a purchase order",
      reason: `SKU is at Reorder — on hand ${onHand}; suggested reorder qty ${reorder}.`,
    };
  }
  if (health === "Healthy") {
    return {
      action: "Monitor stock; no replenishment required",
      reason: `SKU is Healthy — on hand ${onHand} is above reorder thresholds.`,
    };
  }
  return {
    action: "Review stock levels",
    reason: "Select a health signal or open Movements for ledger history.",
  };
}
