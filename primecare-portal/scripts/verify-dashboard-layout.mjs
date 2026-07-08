#!/usr/bin/env node
/** RC2 — Dashboard layout verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const admin = readFileSync(resolve(root, "src/pages/AdminDashboard.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/Executive Command Center/.test(admin), "dashboard.title", "executive command center title");
assert(/dense/.test(admin), "dashboard.dense_kpi", "dense KPI cards");
assert(/space-y-3/.test(admin), "dashboard.spacing", "compact page spacing");
assert(/Today's Revenue/.test(admin), "dashboard.today_revenue", "today business KPI");
assert(/HqPrioritiesStrip/.test(admin), "dashboard.priorities", "founder priorities strip");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — dashboard layout verified\n");
