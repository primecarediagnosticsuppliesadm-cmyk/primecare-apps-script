#!/usr/bin/env node
/**
 * Collections certification closure — COL-CERT-011 / 003 / 004.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  credit: readFileSync(resolve(root, "src/components/hq/HqCreditRiskCommandCenter.jsx"), "utf8"),
  page: readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8"),
  strip: readFileSync(resolve(root, "src/components/collections/CollectionsContextStrip.jsx"), "utf8"),
  ctxUi: readFileSync(resolve(root, "src/collections/collectionsContextUi.js"), "utf8"),
  visitCtx: readFileSync(resolve(root, "src/pages/agentVisitContext.js"), "utf8"),
  visits: readFileSync(resolve(root, "src/pages/AgentVisitPage.jsx"), "utf8"),
  labs: readFileSync(resolve(root, "src/pages/LabsPage.jsx"), "utf8"),
};

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

// COL-CERT-011
assert(/Start here/.test(files.credit), "c011.start_here", "Start here label on interventions");
assert(/aria-label="Start here — high-risk interventions"/.test(files.credit), "c011.aria", "Interventions section labeled for discoverability");
assert(
  files.credit.indexOf("Start here — high-risk interventions") <
    files.credit.indexOf('aria-label="Collections requiring attention"'),
  "c011.order",
  "Interventions appear before Attention Queue"
);
assert(/onRecordPayment\?\.\(row\.labId\)/.test(files.credit), "c011.record_payment", "Intervention primary CTA records payment");

// COL-CERT-003
assert(/CollectionsContextStrip/.test(files.page), "c003.strip_wired", "Context strip on Collections page");
assert(/buildCollectionsContextParts/.test(files.ctxUi), "c003.builder", "Context parts builder present");
assert(/Viewing:/.test(files.strip), "c003.viewing", "Strip shows Viewing orientation");
assert(/Recording:/.test(files.ctxUi), "c003.recording", "Selected lab context part");
assert(/onAttentionFilterChange/.test(files.credit), "c003.filter_sync", "Attention filter syncs to parent context");

// COL-CERT-004
assert(/returnPath: "collections"/.test(files.page), "c004.visit_return", "Schedule follow-up returns to collections");
assert(/writeAgentWorkspaceReturnPath\("collections"\)/.test(files.page), "c004.lab_return", "Open lab writes collections return path");
assert(/peekAgentWorkspaceReturnPath/.test(files.visitCtx), "c004.peek", "Peek helper for return path");
assert(/Back to Collections/.test(files.visits), "c004.visits_cta", "Visits shows Back to Collections");
assert(/Back to Collections/.test(files.labs), "c004.labs_cta", "Labs shows Back to Collections");
assert(/overrides\.returnPath/.test(files.visitCtx), "c004.override", "Visit start accepts returnPath override");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — collections certification closure verified\n");
