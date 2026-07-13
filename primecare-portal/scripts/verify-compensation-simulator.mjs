#!/usr/bin/env node
/**
 * Phase 5A compensation simulator verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { simulateCompensationPlan } from "../src/compensation/compensationPlanSimulator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const detailsSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlanDetailsPanel.jsx"), "utf8");
const simulatorSrc = readFileSync(resolve(root, "src/compensation/compensationPlanSimulator.js"), "utf8");

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

const result = simulateCompensationPlan({
  salary: 20000,
  fuel: 5000,
  mobile: 500,
  commissionRatePct: 3,
  collectionAmount: 100000,
});

assert(result.previewOnly === true, "sim.preview_only", "simulator is preview only");
assert(result.writesData === false, "sim.no_writes", "simulator never writes data");
assert(result.outputs.expectedCommission === 3000, "sim.commission", "commission = collection × rate");
assert(result.outputs.netPayroll === 28500, "sim.net", "net payroll includes fixed + commission");
assert(/Simulate/.test(detailsSrc), "ui.simulate_panel", "simulate panel present");
assert(/Expected Commission/.test(detailsSrc), "ui.expected_commission", "expected commission displayed");
assert(/Expected Payroll/.test(detailsSrc), "ui.expected_payroll", "expected payroll displayed");
assert(/Net Payroll/.test(detailsSrc), "ui.net_payroll", "net payroll displayed");
assert(!/\.insert\(/.test(simulatorSrc), "sim.no_insert", "simulator has no persistence");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
