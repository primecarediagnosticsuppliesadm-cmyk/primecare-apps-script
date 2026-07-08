#!/usr/bin/env node
/** Phase 9.0 — Commercial reuse / no-duplicate CRM guard. */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const readSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceRead.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/CommercialCrmPage.jsx"), "utf8");
const matrixSrc = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const portalSrc = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const blueprintSrc = readFileSync(
  resolve(root, "docs/PrimeCare_System_Blueprint/21_Commercial_CRM.md"),
  "utf8"
);

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/canonicalSources/.test(modelSrc), "model.canonical", "declares canonical sources");
assert(/lab_qualifications/.test(modelSrc) && /agent_visits/.test(modelSrc) && /lab_contracts/.test(modelSrc), "sot.tables", "reuses existing tables");
assert(/getQualificationReviewRead/.test(readSrc), "reuse.qual", "reuses qualification read");
assert(/loadVisibleLabContracts/.test(readSrc), "reuse.contracts", "reuses contract portfolio read");
assert(/commercialCrm/.test(matrixSrc), "nav.permission", "commercialCrm permission declared");
assert(/CommercialCrmPage/.test(portalSrc), "nav.portal", "portal routes Commercial page");
assert(/compose/.test(blueprintSrc.toLowerCase()) || /REUSE/.test(blueprintSrc), "blueprint.compose", "blueprint mandates reuse");
assert(!existsSync(resolve(root, "supabase/migrations/20260708_commercial_crm.sql")), "guard.no_migration", "no commercial CRM migration");
assert(!/from\("leads"\)|from\("quotes"\)|from\("crm_/.test(readSrc + modelSrc), "guard.no_crm_tables", "no Salesforce-like CRM tables");
assert(!/\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(modelSrc + readSrc), "guard.read_only", "commercial layer has no supabase writes");
assert(!/generatePayrollPreview|approvePayrollRunWrite/.test(pageSrc), "guard.people_ops", "no payroll APIs on commercial page");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
