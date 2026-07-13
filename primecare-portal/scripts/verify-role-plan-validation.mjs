#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");
const rolesSrc = readFileSync(resolve(root, "src/compensation/enterpriseCompensationRoles.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/assertPlanScopeMatchesEmployee/.test(apiSrc), "api.validation", "assign validates plan role vs employee role");
assert(/planScopeMatchesEmployeeRole/.test(rolesSrc), "domain.validation", "plan/employee role matcher");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
