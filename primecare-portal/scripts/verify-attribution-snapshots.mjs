#!/usr/bin/env node
/**
 * Phase 3B attribution snapshot verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCommissionEntries } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");

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

const common = {
  period: {
    id: "period-1",
    tenant_id: "tenant-1",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
  },
  planAssignments: [
    {
      id: "assign-a1",
      tenant_id: "tenant-1",
      plan_id: "plan-a",
      agent_id: "A1",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
    {
      id: "assign-a2",
      tenant_id: "tenant-1",
      plan_id: "plan-a",
      agent_id: "A2",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
  ],
  compensationPlans: [{ id: "plan-a", commission_rate_bps: 300 }],
};

const priority = calculateCommissionEntries({
  ...common,
  payments: [
    {
      payment_id: "PAY-PRIORITY",
      tenant_id: "tenant-1",
      lab_id: "LAB-1",
      payment_date: "2026-06-10",
      amount_received: 1000,
      agent_id: "A1",
    },
  ],
  attributionSnapshots: [
    {
      id: "snap-wrong",
      payment_id: "PAY-PRIORITY",
      tenant_id: "tenant-1",
      agent_id: "A2",
      payment_date: "2026-06-10",
      lab_id: "LAB-1",
    },
  ],
});
assert(priority.entries[0]?.agent_id === "A1", "attribution.payment_agent_priority", "payment.agent_id wins");
assert(
  priority.entries[0]?.attribution_method === "payment_agent_id",
  "attribution.payment_method",
  "payment attribution method stored"
);

const fallback = calculateCommissionEntries({
  ...common,
  payments: [
    {
      payment_id: "PAY-SNAPSHOT",
      tenant_id: "tenant-1",
      lab_id: "LAB-2",
      payment_date: "2026-06-11",
      amount_received: 1000,
      agent_id: "",
    },
  ],
  attributionSnapshots: [
    {
      id: "snap-a2",
      payment_id: "PAY-SNAPSHOT",
      tenant_id: "tenant-1",
      agent_id: "A2",
      agent_name: "Agent Two",
      payment_date: "2026-06-11",
      lab_id: "LAB-2",
      attribution_method: "lab_ownership_snapshot",
    },
  ],
});
assert(fallback.entries[0]?.agent_id === "A2", "attribution.snapshot_fallback", "snapshot fallback used");
assert(
  fallback.entries[0]?.attribution_snapshot_id === "snap-a2",
  "attribution.snapshot_id",
  "snapshot id persisted on commission entry"
);

const missing = calculateCommissionEntries({
  ...common,
  payments: [
    {
      payment_id: "PAY-MISSING",
      tenant_id: "tenant-1",
      lab_id: "LAB-3",
      payment_date: "2026-06-12",
      amount_received: 1000,
      agent_id: "",
    },
  ],
  attributionSnapshots: [],
});
assert(missing.entries.length === 0, "attribution.missing_no_entry", "missing snapshot does not guess");
assert(
  missing.warnings.some((warning) => warning.code === "missing_attribution_snapshot"),
  "attribution.missing_warning",
  "missing snapshot warning recorded"
);

assert(/from\("compensation_attribution_snapshots"\)/.test(apiSrc), "api.snapshot_read", "API reads snapshots");
assert(!/from\("lab_ownership"\)|from\('lab_ownership'\)/.test(apiSrc), "api.no_current_ownership", "API does not read current ownership");
assert(
  /missing_attribution_snapshot/.test(engineSrc),
  "engine.no_silent_fallback",
  "engine records missing snapshot warning"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
