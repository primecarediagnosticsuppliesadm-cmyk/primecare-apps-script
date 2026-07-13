#!/usr/bin/env node
/** RC2 — Enterprise UI consistency verification. */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const files = {
  tokens: readFileSync(resolve(root, "src/styles/designTokens.js"), "utf8"),
  layout: readFileSync(resolve(root, "src/styles/enterpriseLayout.js"), "utf8"),
  kpi: readFileSync(resolve(root, "src/components/ux/KpiCard.jsx"), "utf8"),
  index: readFileSync(resolve(root, "src/components/ux/index.js"), "utf8"),
  section: readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsSectionCard.jsx"), "utf8"),
};

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/enterpriseLayout/.test(files.layout), "layout.tokens", "enterprise layout tokens");
assert(/denseGap|denseSectionY/.test(files.tokens), "tokens.density", "dense spacing tokens");
assert(/kpiValueDense/.test(files.tokens), "tokens.typography", "dense KPI typography");
assert(/dense\s*=/.test(files.kpi), "kpi.dense", "KpiCard dense mode");
assert(/RoleChip|EnterpriseMetricStrip/.test(files.index), "ux.exports", "RC2 components exported");
assert(/dense\s*=\s*true/.test(files.section), "section.dense_default", "compact section cards default");

for (const rel of [
  "src/components/ux/RoleChip.jsx",
  "src/components/ux/EnterpriseMetricStrip.jsx",
  "src/components/enterprise/ExecutiveCommandCenterShell.jsx",
  "src/components/enterprise/Lab360SectionNav.jsx",
]) {
  assert(existsSync(resolve(root, rel)), `file.${rel}`, `${rel} exists`);
}

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — enterprise UI consistency verified\n");
