#!/usr/bin/env node
/** Phase 8.4 — Read-model-only + single canonical ownership SoT guard. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const readSrc = readFileSync(resolve(root, "src/peopleOps/ownership/peopleOpsOwnershipRead.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const engineSrc = readFileSync(resolve(root, "src/operations/labOwnershipEngine.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

const peopleOpsOwnershipDir = resolve(root, "src/peopleOps/ownership");
const ownershipFiles = readdirSync(peopleOpsOwnershipDir);

assert(ownershipFiles.includes("businessOwnershipModel.js"), "facade.present", "People Ops ownership façade exists");
assert(/canonicalSource:\s*"lab_ownership"/.test(modelSrc), "sot.declared", "lab_ownership declared canonical");
assert(/labOwnershipEngine/.test(modelSrc), "sot.engine_import", "façade imports canonical engine");
assert(/getLabOwnershipRead/.test(readSrc), "sot.api_read", "façade reads via labOwnershipApi");
assert(!/\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(modelSrc + readSrc), "guard.no_supabase_write", "People Ops ownership has no supabase writes");
assert(!/assignLabOwnership|transferLabOwnership|removeLabOwnership|assignPrimaryLabOwnerWrite/.test(modelSrc + readSrc), "guard.no_ownership_write", "no ownership mutation APIs in façade");
assert(!/generatePayrollPreview|submitPayrollRunWrite|approvePayrollRunWrite/.test(modelSrc), "guard.no_payroll", "no payroll mutations");
assert(/buildOwnershipIndex/.test(engineSrc), "sot.engine_export", "single engine owns index builder");
assert(/rawPayload\?\.payments|payments: rawPayload/.test(pageSrc), "reuse.payments", "page feeds ownership from existing compensation payments");
assert(!/create table.*business_ownership|from\("business_ownership"\)/i.test(modelSrc + readSrc), "guard.no_new_table", "no parallel business_ownership table");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
