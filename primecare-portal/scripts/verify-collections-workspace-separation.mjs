#!/usr/bin/env node
/**
 * Sprint 1C — Collections workspace separation verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const viewModeSrc = readFileSync(resolve(root, "src/collections/collectionsViewMode.js"), "utf8");
const shellSrc = readFileSync(resolve(root, "src/components/collections/CollectionsWorkspaceShell.jsx"), "utf8");
const searchBarSrc = readFileSync(resolve(root, "src/components/collections/CollectionsSearchBar.jsx"), "utf8");
const agentWsSrc = readFileSync(
  resolve(root, "src/components/collections/workspaces/AgentCollectionsWorkspace.jsx"),
  "utf8"
);
const creditWsSrc = readFileSync(
  resolve(root, "src/components/collections/workspaces/HqCreditRiskWorkspace.jsx"),
  "utf8"
);
const recvWsSrc = readFileSync(
  resolve(root, "src/components/collections/workspaces/HqReceivablesWorkspace.jsx"),
  "utf8"
);
const labWsSrc = readFileSync(
  resolve(root, "src/components/collections/workspaces/LabAccountWorkspace.jsx"),
  "utf8"
);

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

assert(/COLLECTIONS_WORKSPACES/.test(viewModeSrc), "mode.workspaces", "workspace constants defined");
assert(/resolveCollectionsWorkspace/.test(viewModeSrc), "mode.resolve", "workspace resolver defined");
assert(/getCollectionsWorkspaceMeta/.test(viewModeSrc), "mode.meta", "workspace metadata helper defined");
assert(/primaryQuestion/.test(viewModeSrc), "mode.primary_question", "primary business question per workspace");

assert(/data-workspace=\{workspaceId\}/.test(shellSrc), "shell.data_workspace", "workspace shell exposes data-workspace");
assert(/primaryQuestion/.test(shellSrc), "shell.primary_question", "workspace shell renders primary question");

assert(/CollectionsSearchBar/.test(searchBarSrc), "search.component", "shared search bar component");

assert(/AgentCollectionsWorkspace/.test(agentWsSrc), "agent.workspace", "agent workspace component");
assert(/aria-label="Accounts due"/.test(agentWsSrc), "agent.accounts_section", "agent accounts section labeled");
assert(/CollectionsWorkspaceShell/.test(agentWsSrc), "agent.shell", "agent workspace uses shell");

assert(/HqCreditRiskWorkspace/.test(creditWsSrc), "credit.workspace", "credit workspace component");
assert(/HqCreditRiskCommandCenter/.test(creditWsSrc), "credit.command_center", "command center in credit workspace");
assert(/aria-label="Credit intervention command center"/.test(creditWsSrc), "credit.cc_section", "command center section labeled");

assert(/HqReceivablesWorkspace/.test(recvWsSrc), "recv.workspace", "receivables workspace component");
assert(/aria-label="Receivables ledger"/.test(recvWsSrc), "recv.ledger_section", "receivables ledger section labeled");

assert(/LabAccountWorkspace/.test(labWsSrc), "lab.workspace", "lab account workspace component");
assert(/aria-label="Account activity and invoices"/.test(labWsSrc), "lab.activity_section", "lab activity section labeled");

assert(/resolveCollectionsWorkspace/.test(pageSrc), "page.resolve_workspace", "page resolves workspace");
assert(/getCollectionsWorkspaceMeta/.test(pageSrc), "page.workspace_meta", "page reads workspace metadata");
assert(/AgentCollectionsWorkspace/.test(pageSrc), "page.agent_workspace", "page renders agent workspace");
assert(/HqCreditRiskWorkspace/.test(pageSrc), "page.credit_workspace", "page renders credit workspace");
assert(/HqReceivablesWorkspace/.test(pageSrc), "page.recv_workspace", "page renders receivables workspace");
assert(/LabAccountWorkspace/.test(pageSrc), "page.lab_workspace", "page renders lab workspace");
assert(!/<HqCreditRiskCommandCenter/.test(pageSrc), "page.no_inline_cc", "command center no longer inline in page");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — collections workspace separation verified\n");
