/**
 * Pure Flow 3A single-order Mark Fulfilled freeze resolver.
 * UI/UX policy only — no SQL, RLS, RPC, or fulfillment business logic.
 */

export function resolveHqOrderFulfillWriteBlocked({
  hqAdminFrozen,
  isProd,
  certFulfillOrderId,
  orderId,
  currentStatus,
}) {
  if (!hqAdminFrozen) return false;
  if (!isProd) return true;
  const allowed = String(certFulfillOrderId || "").trim();
  if (!allowed) return true;
  if (String(orderId || "").trim() !== allowed) return true;
  const status = String(currentStatus || "").trim();
  return status !== "Placed" && status !== "Processing";
}
