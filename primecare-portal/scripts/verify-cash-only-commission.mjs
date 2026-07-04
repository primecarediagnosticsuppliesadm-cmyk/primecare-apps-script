#!/usr/bin/env node
/**
 * Phase 3B cash-only commission verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCommissionEntries } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

const result = calculateCommissionEntries({
  period: {
    id: "p1",
    tenant_id: "tenant-1",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
  },
  payments: [
    {
      payment_id: "PAY-CASH",
      tenant_id: "tenant-1",
      lab_id: "LAB-1",
      payment_date: "2026-06-04",
      amount_received: 1000,
      agent_id: "A1",
      order_value: 1000000,
      invoice_value: 1000000,
      projected_revenue: 1000000,
      outstanding: 1000000,
      allocated_amount: 1000000,
    },
  ],
  planAssignments: [
    {
      id: "assign-a1",
      tenant_id: "tenant-1",
      plan_id: "plan-a",
      agent_id: "A1",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
  ],
  compensationPlans: [{ id: "plan-a", commission_rate_bps: 300, version: "v1" }],
});

const entry = result.entries[0];
assert(entry.attributable_cash_collected === 1000, "cash.amount", "only amount_received is commission cash");
assert(entry.commission_amount === 30, "cash.commission", "commission = collected cash x 3%");
assert(entry.source_payment_refs.includes("PAY-CASH"), "cash.source_ref", "source payment reference stored");

const forbiddenReadPatterns = [
  /\.from\(["']orders["']\)/,
  /\.from\(["']invoices["']\)/,
  /\.from\(["']invoice_payment_allocations["']\)/,
  /\.from\(["']commission_entries["']\)/,
  /\.from\(["']proj_/,
  /order_value|invoice_value|projected_revenue|fulfilled_revenue|allocated_amount/i,
];

for (const pattern of forbiddenReadPatterns) {
  assert(!pattern.test(apiSrc), `api.forbidden.${pattern.source}`, "forbidden source not used by API");
}

assert(/amount_received|amountReceived/.test(engineSrc), "engine.cash_field", "engine reads amount_received");
assert(
  !/order_total|invoice_total|projected_revenue|fulfilled_revenue|allocated_amount/i.test(engineSrc),
  "engine.no_forbidden_inputs",
  "engine does not consume revenue/order/invoice/allocation fields"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
