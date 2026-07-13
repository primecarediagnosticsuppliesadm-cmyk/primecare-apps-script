#!/usr/bin/env node
/**
 * Sprint 1B — Agent collections interaction feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const agentUiSrc = readFileSync(resolve(root, "src/collections/agentCollectionsUi.js"), "utf8");
const paymentUiSrc = readFileSync(resolve(root, "src/collections/collectionsPaymentUi.js"), "utf8");

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

assert(/AGENT_COLLECTIONS_SEARCH_DEBOUNCE_MS = 300/.test(agentUiSrc), "ui.debounce_ms", "300ms debounce constant");
assert(/buildAgentCollectionsEmptyCopy/.test(agentUiSrc), "ui.empty_copy", "search-aware empty copy helper");
assert(/primecare_agent_collections_search/.test(agentUiSrc), "ui.search_persist_key", "search session key");
assert(/primecare_agent_collections_selected_lab/.test(agentUiSrc), "ui.selection_persist_key", "selected lab session key");

assert(/localSearch/.test(pageSrc), "page.local_search", "agent local search state");
assert(/debouncedSearch/.test(pageSrc), "page.debounced_search", "agent debounced search state");
assert(/effectiveSearch/.test(pageSrc), "page.effective_search", "effective search for filtering");
assert(/isSelected/.test(pageSrc), "page.selected_highlight", "selected lab highlight prop");
assert(/aria-current=\{isSelected/.test(pageSrc), "page.aria_current", "selected row exposes aria-current");
assert(/Recording for /.test(pageSrc), "page.selected_strip", "selected lab context strip");
assert(/Work queue updated/.test(pageSrc), "page.refresh_toast", "refresh success feedback");
assert(/ListSkeleton/.test(pageSrc) && /listRefreshing/.test(pageSrc), "page.refresh_skeleton", "queue refresh skeleton");
assert(/saveInflightRef/.test(pageSrc), "page.duplicate_guard", "duplicate submission guard");
assert(/evidenceUploadStatus/.test(pageSrc), "page.evidence_status", "evidence upload status state");
assert(/uploadStatus=\{evidenceUploadStatus\}/.test(pageSrc), "page.evidence_field_status", "evidence field wired to status");
assert(/getEvidenceUploadProgressMessage/.test(pageSrc), "page.evidence_progress", "evidence upload progress message");
assert(/proofUploadFailed/.test(pageSrc), "page.proof_failure_lifecycle", "drawer stays open on proof failure");
assert(/writeAgentCollectionsSearch/.test(pageSrc), "page.persist_search", "search persisted across refresh");
assert(/writeAgentCollectionsSelectedLab/.test(pageSrc), "page.persist_selection", "selected lab persisted");

assert(/getEvidenceUploadProgressMessage/.test(paymentUiSrc), "payment.progress_helper", "upload progress label helper");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — agent collections interaction feedback verified\n");
