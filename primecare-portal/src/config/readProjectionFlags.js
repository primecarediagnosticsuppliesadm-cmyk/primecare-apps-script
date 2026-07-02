/** Feature flags for domain projection read adapters (Blueprint 18). */

function flagEnabled(name) {
  return String(import.meta.env[name] || "")
    .trim()
    .toLowerCase() === "true";
}

/** When true, OrdersPage uses read_orders_list_v1 instead of transactional getOrdersRead. */
export function isReadAdapterOrdersV1Enabled() {
  return flagEnabled("VITE_READ_ADAPTER_ORDERS_V1");
}

/** When true, CollectionsPage uses read_lab_receivables_list_v1. */
export function isReadAdapterReceivablesV1Enabled() {
  return flagEnabled("VITE_READ_ADAPTER_RECEIVABLES_V1");
}

/** Shadow mode: projection tables populated; flags default OFF. */
export function isProjectionShadowMode() {
  return !isReadAdapterOrdersV1Enabled() && !isReadAdapterReceivablesV1Enabled();
}

export const PROJECTION_STALENESS_SLA_MS = {
  orders: 60_000,
  receivables: 60_000,
  agentReceivables: 0,
};
