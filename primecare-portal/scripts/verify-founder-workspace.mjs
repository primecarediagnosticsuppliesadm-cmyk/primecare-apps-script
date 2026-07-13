#!/usr/bin/env node
/** Phase 9.2 Founder OS workspace verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const files = {
  read: readFileSync(resolve(root, "src/founder/founderWorkspaceRead.js"), "utf8"),
  model: readFileSync(resolve(root, "src/founder/founderWorkspaceModel.js"), "utf8"),
  page: readFileSync(resolve(root, "src/pages/FounderOperatingSystemPage.jsx"), "utf8"),
  nav: readFileSync(resolve(root, "src/founder/founderOperatingNavigation.js"), "utf8"),
};

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/loadOperationsCommandCenterCore/.test(files.read), "read.ops", "Ops core read reused");
assert(/loadCommercialWorkspaceRead/.test(files.read), "read.commercial", "Commercial read reused");
assert(/loadExecutiveCompensationCenterRead/.test(files.read), "read.people", "Compensation read reused");
assert(/buildExecutiveActionQueue/.test(files.read), "read.queue", "Action queue reused");
assert(/buildFounderWorkspace/.test(files.model), "model.builder", "Workspace model exists");

for (const fn of [
  "buildFounderTodaysBusiness",
  "buildFounderRevenueSection",
  "buildFounderCollectionsSection",
  "buildFounderOperationsSection",
  "buildFounderPeopleSection",
  "buildFounderInventorySection",
  "buildFounderGrowthSection",
]) {
  assert(new RegExp(`export function ${fn}`).test(files.model), `model.${fn}`, `${fn} exported`);
}

assert(/FOUNDER_OS_MODULES/.test(files.nav), "nav.modules", "Founder modules declared");
assert(/FounderOperatingSystemPage/.test(files.page), "page.wired", "Founder OS page exists");
assert(!/createPaymentWrite|payrollDomainSupabaseApi\.(create|update)/.test(files.read + files.model), "boundary.no_writes", "No finance/payroll writes");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder workspace verified\n");
