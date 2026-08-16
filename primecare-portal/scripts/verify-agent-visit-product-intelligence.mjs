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

/** Catch missing imports that Vite/build will not fail on (runtime ReferenceError). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function importedNames(src) {
  const names = new Set();
  for (const block of src.matchAll(/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]+)\}/g)) {
    for (const part of block[1].split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      const bits = raw.split(/\s+as\s+/);
      names.add(bits[bits.length - 1].trim());
    }
  }
  for (const m of src.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from/gm)) names.add(m[1]);
  return names;
}

function localBindings(src) {
  const names = importedNames(src);
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      const bits = raw.split(/\s*:\s*/);
      names.add(bits[bits.length - 1].replace(/\s*=.*$/, "").trim());
    }
  }
  return names;
}

function isHelperStyleName(name) {
  if (/^(set|use|on|handle|is|has)[A-Z]/.test(name)) return false;
  return /[a-z][A-Z]/.test(name);
}

function unboundHelperCallees(src) {
  const bound = localBindings(src);
  const code = stripComments(src);
  const missing = new Set();
  for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\(/g)) {
    const name = m[1];
    if (!isHelperStyleName(name)) continue;
    if (bound.has(name)) continue;
    missing.add(name);
  }
  return [...missing].sort();
}

const imports = importedNames(visitPage);
assert(
  imports.has("displayResponseLabel"),
  "runtime.import.displayResponseLabel",
  "displayResponseLabel imported from canonical helper"
);
assert(
  visitPage.includes('from "@/utils/agentVisitDisplay.js"'),
  "runtime.import.agentVisitDisplay",
  "canonical agentVisitDisplay module is imported"
);
assert(
  imports.has("enrichVisitForDisplay"),
  "runtime.import.enrichVisitForDisplay",
  "enrichVisitForDisplay imported (used after visit load, not only on Proof & Save)"
);

const missingVisitPage = unboundHelperCallees(visitPage);
assert(
  missingVisitPage.length === 0,
  "runtime.unbound.AgentVisitPage",
  missingVisitPage.length
    ? `unbound helper calls: ${missingVisitPage.join(", ")}`
    : "no unbound helper-style calls in AgentVisitPage (all six steps)"
);

const missingStep = unboundHelperCallees(stepSrc);
assert(
  missingStep.length === 0,
  "runtime.unbound.VisitProductIntelligenceStep",
  missingStep.length
    ? `unbound helper calls: ${missingStep.join(", ")}`
    : "no unbound helper-style calls in Products step"
);

const missingModel = unboundHelperCallees(modelSrc);
assert(
  missingModel.length === 0,
  "runtime.unbound.labProductIntelligenceModel",
  missingModel.length
    ? `unbound helper calls: ${missingModel.join(", ")}`
    : "no unbound helper-style calls in product model"
);

const wizardUxMissing = unboundHelperCallees(wizardUx);
assert(
  wizardUxMissing.length === 0,
  "runtime.unbound.agentVisitWizardUx",
  wizardUxMissing.length
    ? `unbound helper calls: ${wizardUxMissing.join(", ")}`
    : "no unbound helper-style calls in wizard copy helpers"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
