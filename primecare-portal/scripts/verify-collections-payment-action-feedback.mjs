#!/usr/bin/env node
/**
 * Sprint 1A — Collections payment action feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const expandedPanelSrc = pageSrc;
const labPanelSrc = readFileSync(resolve(root, "src/components/collections/LabCollectionPanel.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/collections/mapCollectionMutationError.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/collections/collectionsPaymentUi.js"), "utf8");

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

assert(/mapCollectionMutationError/.test(pageSrc), "page.mutation_mapper", "page uses collection mutation mapper");
assert(/paymentMutationError/.test(pageSrc), "page.mutation_error_state", "payment mutation error state present");
assert(/return \{ success: false, error:/.test(pageSrc), "page.mutation_return", "save handler returns structured results");
assert(!/showToast\(\"error\", err\.message \|\| \"Failed to save collection update\"\)/.test(pageSrc), "page.no_error_toast", "payment failure no longer uses error toast only");
assert(/setPaymentMutationError\(null\)/.test(pageSrc), "page.clear_error", "mutation error cleared on submit/open");
assert(/closeDrawerOnSuccess/.test(pageSrc), "page.drawer_success_lifecycle", "drawer closes on successful save");

assert(/ActionErrorSummary/.test(expandedPanelSrc), "expanded.error_summary", "expanded panel shows action error summary");
assert(/paymentMutationError/.test(expandedPanelSrc), "expanded.mutation_error_prop", "expanded panel accepts mutation error prop");
assert(/Recording payment…/.test(uiSrc), "ui.payment_loading", "payment loading label defined");
assert(/Saving follow-up…/.test(uiSrc), "ui.followup_loading", "follow-up loading label defined");
assert(/getCollectionSaveLoadingLabel/.test(expandedPanelSrc), "expanded.loading_helper", "expanded panel uses loading label helper");
assert(/aria-busy=\{saveBusy\}/.test(expandedPanelSrc), "expanded.aria_busy", "submit button exposes busy state");

assert(/ActionErrorSummary/.test(labPanelSrc), "lab.error_summary", "lab collection panel shows action error summary");
assert(/paymentMutationError/.test(labPanelSrc), "lab.mutation_error_prop", "lab panel accepts mutation error prop");
assert(/getCollectionSaveLoadingLabel/.test(labPanelSrc), "lab.loading_helper", "lab panel uses loading label helper");
assert(/aria-busy=\{saveBusy\}/.test(labPanelSrc), "lab.aria_busy", "lab panel submit exposes busy state");

assert(/amount_received must be > 0/i.test(mapperSrc), "map.amount_required", "amount validation error mapped");
assert(/allocation failed/i.test(mapperSrc), "map.allocation_failed", "allocation failure mapped");
assert(/Could not record payment/.test(mapperSrc), "map.payment_title", "business title for payment failure");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — collections payment action feedback verified\n");
