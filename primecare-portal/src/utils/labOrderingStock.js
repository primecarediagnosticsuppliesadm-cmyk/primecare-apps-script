/**
 * Lab ordering inventory guards — Year-1 HQ pilot (no backorder).
 */

export function availableStockForProduct(item) {
  if (!item) return 0;
  return Math.max(0, Number(item.currentStock ?? item.current_stock ?? 0));
}

/**
 * @param {number} qty
 * @param {number} maxAvailable
 * @returns {number} 0 when no stock; otherwise clamped to [1, maxAvailable]
 */
export function clampOrderQuantity(qty, maxAvailable) {
  const max = Math.max(0, Number(maxAvailable || 0));
  if (max <= 0) return 0;
  return Math.min(Math.max(1, Number(qty || 1)), max);
}

export function onlyAvailableLabel(available) {
  const n = Math.max(0, Number(available || 0));
  if (n <= 0) return "Out of stock";
  return `Only ${n.toLocaleString()} available`;
}

/**
 * @param {Array<{ productId?: string, productName?: string, quantity?: number, currentStock?: number }>} cartItems
 * @param {Map<string, object>} catalogByProductId
 */
export function findCartStockViolations(cartItems, catalogByProductId) {
  const violations = [];
  for (const item of cartItems || []) {
    const productId = String(item.productId || "");
    const catalogItem = catalogByProductId?.get?.(productId);
    const available = availableStockForProduct(catalogItem ?? item);
    const requested = Number(item.quantity || 0);
    if (requested <= 0) continue;
    if (available <= 0 || requested > available) {
      violations.push({
        productId,
        productName: item.productName || productId,
        requested,
        available,
      });
    }
  }
  return violations;
}

export function formatCartStockViolationMessage(violations) {
  if (!violations?.length) return "";
  const parts = violations.map((v) => {
    if (v.available <= 0) {
      return `${v.productName}: out of stock (requested ${v.requested})`;
    }
    return `${v.productName}: requested ${v.requested}, only ${v.available} available`;
  });
  return `Cannot submit order — ${parts.join("; ")}. Update your cart and try again.`;
}
