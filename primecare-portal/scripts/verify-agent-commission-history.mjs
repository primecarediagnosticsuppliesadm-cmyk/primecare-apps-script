#!/usr/bin/env node
/**
 * Phase 5B agent commission history verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentCompensation360Model } from "../src/compensation/agentCompensation360Model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/AgentCompensation360Panel.jsx"),
  "utf8"
);
const apiSrc = readFileSync(resolve(root, "src/api/agentCompensation360SupabaseApi.js"), "utf8");

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

for (const column of [
  "Collected Cash",
  "Commission %",
  "Commission Earned",
  "Source Payments",
  "Calculation Version",
]) {
  assert(panelSrc.includes(column), `column.${column}`, `${column} commission history column present`);
}

assert(/commissionHistory/.test(panelSrc), "ui.section", "commission history section present");
assert(/compensation_commission_entries/.test(apiSrc), "api.entries", "360 loader reads commission entries");
assert(!/from\("(payments|orders|invoices)"\)\s*\.(update|insert|delete|upsert)/.test(apiSrc), "api.no_o2c_writes", "360 API does not mutate O2C");

const model = buildAgentCompensation360Model({
  agentId: "QA_AGENT_001",
  commissionEntries: [
    {
      id: "ce-1",
      period_id: "period-1",
      attributable_cash_collected: 615,
      commission_rate_bps: 300,
      commission_amount: 18.45,
      rule_version: "PC_COMP_YEAR1_2026_PHASE4B",
      metadata: { payment_count: 7 },
    },
  ],
  payrollPeriods: [{ id: "period-1", period_ym: "2026-07" }],
});
assert(model.commissionHistory.length === 1, "model.rows", "commission history rows built");
assert(model.commissionHistory[0].commissionEarned === 18.45, "model.amount", "commission earned mapped");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
