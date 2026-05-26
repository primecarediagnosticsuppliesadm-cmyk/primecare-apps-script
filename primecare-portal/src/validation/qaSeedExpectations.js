/**
 * Canonical QA seed expectations for Admin Dashboard Phase 1 validation.
 * Update when QA seed data changes.
 *
 * Immutable fields: compared directly to seed after fresh QA load.
 * Mutable fields: seed is informational baseline only; runtime validation uses
 * browser RLS / DB rollup and fails only when DB/API/UI layers disagree.
 */
export const QA_ADMIN_DASHBOARD_SEED = {
  ordersCount: 3,
  outstandingReceivables: 5400,
  recentVisits: 3,
  inventorySkus: 3,
  totalSoldValue: 2400,
};

/** Seed keys validated against fixed QA seed (immutable after load). */
export const QA_ADMIN_DASHBOARD_IMMUTABLE_SEED_KEYS = ["ordersCount", "inventorySkus"];

/** Seed keys that may change during QA (visits saved, payments, fulfillment). */
export const QA_ADMIN_DASHBOARD_MUTABLE_SEED_KEYS = [
  "outstandingReceivables",
  "recentVisits",
  "totalSoldValue",
];
