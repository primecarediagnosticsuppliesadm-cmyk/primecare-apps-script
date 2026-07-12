/**
 * Busy-state labels for inventory-adjacent mutations (Sprint 1A).
 */

export function getCatalogCreateLoadingLabel(openingStock = 0) {
  return Number(openingStock) > 0 ? "Saving Opening Stock…" : "Creating SKU…";
}

export function getCatalogEditLoadingLabel() {
  return "Saving SKU…";
}

export function getSkuToggleLoadingLabel(nextActive) {
  return nextActive ? "Enabling SKU…" : "Disabling SKU…";
}

export function getReceiveStockLoadingLabel() {
  return "Receiving Stock…";
}
