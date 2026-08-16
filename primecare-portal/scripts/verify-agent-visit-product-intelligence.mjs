#!/usr/bin/env node
/** Agent Visit — Products & Purchasing / lab_product_intelligence certification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countCapturedProductLines,
  createEmptyProductLine,
  isProductLineCaptured,
  mapProductLineToWriteRow,
} from "../src/visits/labProductIntelligenceModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function assert(c, id, d) {
  c ? pass(id, d) : fail(id, d);
}

const visitPage = read("src/pages/AgentVisitPage.jsx");
const insertSrc = read("src/predator/schemaAwareness.js");
const apiSrc = read("src/api/primecareSupabaseApi.js");
const mig = read("supabase/migrations/20260815120000_lab_product_intelligence.sql");
const modelSrc = read("src/visits/labProductIntelligenceModel.js");
const stepSrc = read("src/components/agent/VisitProductIntelligenceStep.jsx");
const wizardUx = read("src/pages/agentVisitWizardUx.js");
const bounds = read("src/api/hqReadBounds.js");

assert(
  /key: "products"/.test(visitPage) && /Products & Purchasing/.test(visitPage),
  "ui.step.products",
  "wizard step 3 is Products & Purchasing"
);
assert(!/key: "stock"/.test(visitPage), "ui.step.no_stock_key", "stock step key removed");
assert(
  /key: "qualification"/.test(visitPage) && /Proof & Save/.test(visitPage),
  "ui.step.six",
  "Qualify and Proof & Save remain"
);
assert(
  (visitPage.match(/key: "/g) || []).length >= 6,
  "ui.step.count",
  "six wizard keys remain"
);
assert(
  /VisitProductIntelligenceStep/.test(visitPage) && /Add another product/.test(stepSrc),
  "ui.repeatable",
  "repeatable product cards + add another"
);
assert(
  !/Samples given/.test(visitPage),
  "ui.no_sample_count",
  "generic Samples given field removed from Outcome"
);
assert(
  /sampleRequested/.test(stepSrc) && /Sample requested or issued for this product/.test(stepSrc),
  "ui.sample_on_product",
  "sample capture is product-line scoped"
);
assert(
  !/stockAvailable/.test(visitPage) && !/needsNewStock/.test(visitPage),
  "ui.stock_removed",
  "unused stockAvailable/needsNewStock UI removed"
);
assert(
  /Products captured/.test(visitPage) && /Follow-up/.test(visitPage) && /Qualification/.test(visitPage),
  "ui.review",
  "Proof & Save reviews outcome, products, follow-up, qualification"
);

assert(/CREATE TABLE IF NOT EXISTS public.lab_product_intelligence/.test(mig), "db.table", "child table");
assert(/lab_product_intelligence_select_by_role/.test(mig), "db.rls", "RLS policies");
assert(
  /ADD COLUMN IF NOT EXISTS next_follow_up_type/.test(mig) && /next_action/.test(mig),
  "db.followup_cols",
  "visit follow-up type/action columns"
);
assert(!/ALTER TABLE public.lab_qualifications/.test(mig), "db.no_qual_mix", "product mix not on qualifications");

assert(/next_follow_up_type/.test(insertSrc) && /next_action/.test(insertSrc), "api.visit_insert", "insert columns include follow-up");
assert(/nextFollowUpType/.test(visitPage) && /nextAction/.test(apiSrc), "api.visit_write_payload", "page/API persist follow-up");
assert(/getLabProductIntelligenceRead/.test(apiSrc) && /upsertLabProductIntelligenceWrite/.test(apiSrc), "api.product", "product intel read/write");
assert(/HQ_LAB_PRODUCT_INTELLIGENCE_COLUMNS/.test(bounds), "api.bounded", "bounded column projection");
assert(!/createLabProductIntelligence/.test(read("src/commercial/commercialWorkspaceModel.js")), "no_crm", "commercial compose layer does not own writes");

const empty = createEmptyProductLine();
assert(!isProductLineCaptured(empty), "model.empty", "empty card is not captured");
const captured = { ...empty, productCategory: "edta", brand: "BD" };
assert(isProductLineCaptured(captured), "model.captured", "category+brand counts");
assert(countCapturedProductLines([empty, captured]) === 1, "model.count", "count captured lines");
const row = mapProductLineToWriteRow(captured, { tenantId: "t", labId: "L1", visitId: "VIS-1" });
assert(row.product_category === "edta" && row.source_visit_id === "VIS-1", "model.write", "write row maps visit");
assert(/products: "What does this lab already buy\?"/.test(wizardUx), "ux.subtitle", "products step copy");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
