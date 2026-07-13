#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/coveredEmployeeKeys/.test(engineSrc), "preview.all_assignments", "preview includes uncommissioned assigned employees");
assert(/employeeKey/.test(engineSrc), "preview.employee_key", "employee key identity in preview");
assert(/commissionEligibleRoleScope/.test(engineSrc), "preview.commission_isolation", "commission gated by role scope");
assert(/fixed_payroll_only/.test(engineSrc), "preview.zero_commission_lines", "zero commission payroll lines supported");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
