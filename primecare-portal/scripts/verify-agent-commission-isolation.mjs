#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");
const rolesSrc = readFileSync(resolve(root, "src/compensation/enterpriseCompensationRoles.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/commissionEligibleRoleScope/.test(rolesSrc), "roles.helper", "commission eligibility helper");
assert(/commissionEligibleRoleScope/.test(engineSrc), "engine.commission_eligible", "commission eligibility check in engine");
assert(/commissionEligible[\s\S]*\? bpsAmount/.test(engineSrc), "engine.zero_non_agent", "non-agent commission forced to zero");
assert(/calculateCommissionEntries/.test(engineSrc), "engine.commission_entries", "commission entries remain agent/cash path");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
