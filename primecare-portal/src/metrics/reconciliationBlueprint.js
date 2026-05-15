/**
 * Design-only blueprint for batch reconciliation jobs (no scheduler wired here).
 * Each job compares two derived totals and emits structured diff rows for ops review.
 */
export const RECONCILIATION_JOB_BLUEPRINT = [
  {
    id: "orders_vs_ledger",
    description: "Fulfilled order line totals vs inventory ledger movements (ORDER_OUT) by order_id.",
    sources: [{ table: "orders" }, { table: "order_items" }, { viewOrTable: "inventory_ledger*" }],
    engineHint: "For each fulfilled order: sum(order_items net line) ?= sum(ledger qty * unit) for SKU moves tagged with order.",
  },
  {
    id: "inventory_on_hand_vs_ledger",
    description: "inventory.current_stock vs net ledger rollups per SKU/product_id.",
    sources: [{ table: "inventory" }, { table: "inventory_ledger* or stock_movements" }],
    engineHint: "Rolling sum of inbound/outbound ledger by product should match current_stock (± known pending allocations).",
  },
  {
    id: "ar_vs_payments",
    description: "ar_credit_control totals vs Σ payments grouped by normalized lab_id + opening balance.",
    sources: [{ table: "ar_credit_control" }, { table: "payments" }],
    engineHint: "Reuse buildPaymentsByNormalizedLabId normalization; Σ payments per lab ?= delivered − outstanding with tolerance.",
  },
  {
    id: "dashboard_vs_source_totals",
    description: "Re-run computeRevenueMetrics, computeReceivableMetrics, rollupInventoryTableRows on raw pulls vs cached dashboard payload.",
    sources: [{ tables: ["orders", "order_items", "ar_credit_control", "inventory"] }],
    engineHint:
      "Nightly cron: SELECT * snapshots → deterministic engines → diff against persisted snapshot or Portal cache.",
  },
];
