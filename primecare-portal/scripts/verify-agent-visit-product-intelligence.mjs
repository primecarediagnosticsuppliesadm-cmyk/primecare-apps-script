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

const debugLogger = read("src/utils/debugLogger.js");
const proxySrc = read("api/primecare.js");
const notifySrc = read("src/notifications/createNotificationEvent.js");
const notifyInsertSrc = read("src/notifications/notificationEventInsert.js");
const grantsMig = read("supabase/migrations/20260816120000_agent_visit_authenticated_grants.sql");
const notifyParityMig = read(
  "supabase/migrations/20260816140000_notification_events_foundation_parity.sql"
);

assert(
  /if \(!ALLOW_LEGACY_APPS_SCRIPT\)/.test(debugLogger) &&
    /legacy_apps_script_disabled/.test(debugLogger) &&
    /predatorStore\.recordError/.test(debugLogger),
  "runtime.logClientError.noop",
  "logClientError no-ops Apps Script when legacy is disabled; records predator error"
);
assert(
  /action === "logClientError"/.test(proxySrc) &&
    /legacy_apps_script_disabled/.test(proxySrc) &&
    !/Missing PRIMECARE_APPS_SCRIPT_URL environment variable/.test(proxySrc),
  "runtime.proxy.no_500_logging",
  "/api/primecare does not 500 for logClientError when Apps Script URL is unset"
);
assert(
  /asUuidOrNull/.test(notifyInsertSrc) &&
    /actor_user_id: actorUserId/.test(notifyInsertSrc) &&
    /buildAgentVisitLoggedNotificationEvent/.test(notifyInsertSrc),
  "runtime.notify.uuid",
  "notification builder nulls non-UUID actor ids (avoids 400)"
);
assert(
  /isUnknownNotificationColumnError/.test(notifySrc) &&
    /notificationEventsWriteShape/.test(notifySrc) &&
    /using legacy stub shape/.test(notifySrc),
  "runtime.notify.legacy_fallback",
  "createNotificationEvent caches legacy shape after PGRST204"
);
assert(
  /buildNotificationDeliveryLogInsertRows/.test(notifySrc) &&
    /buildNotificationDeliveryLogInsertRows/.test(notifyInsertSrc),
  "runtime.notify.delivery_builder",
  "delivery log insert uses QA-canonical builder"
);
const visibilityHelperMig = read(
  "supabase/migrations/20260816145000_notification_event_visibility_helper_parity.sql"
);
assert(
  /CREATE OR REPLACE FUNCTION public\.notification_event_visible_to_current_user\(/.test(
    visibilityHelperMig
  ) &&
    /STABLE/.test(visibilityHelperMig) &&
    /SECURITY DEFINER/.test(visibilityHelperMig) &&
    /SET search_path = public/.test(visibilityHelperMig) &&
    /tenant_id_matches\(p_tenant_id\)/.test(visibilityHelperMig) &&
    /lab_record_is_visible_to_current_user\(p_tenant_id, p_target_lab_id\)/.test(
      visibilityHelperMig
    ) &&
    /GRANT EXECUTE ON FUNCTION public\.notification_event_visible_to_current_user\(uuid, text, uuid, text\) TO authenticated/.test(
      visibilityHelperMig
    ),
  "db.notify.visibility_helper_parity",
  "prerequisite QA-canonical notification_event_visible_to_current_user migration before delivery log"
);
const deliveryMig = read(
  "supabase/migrations/20260816150000_notification_delivery_log_parity.sql"
);
assert(
  /CREATE TABLE IF NOT EXISTS public.notification_delivery_log/.test(deliveryMig) &&
    /provider_message_id/.test(deliveryMig) &&
    /provider_error/.test(deliveryMig) &&
    /created_at/.test(deliveryMig) &&
    !/recipient text/.test(deliveryMig) &&
    !/provider_response/.test(deliveryMig) &&
    /REVOKE ALL ON TABLE public.notification_delivery_log FROM anon/.test(deliveryMig) &&
    /GRANT SELECT, INSERT ON TABLE public.notification_delivery_log TO authenticated/.test(
      deliveryMig
    ) &&
    /notification_event_visible_to_current_user\(/.test(deliveryMig),
  "db.delivery_log.parity_migration",
  "versioned QA-canonical notification_delivery_log migration"
);
assert(
  "20260816145000" < "20260816150000",
  "db.notify.migration_order",
  "visibility helper migration timestamp precedes delivery_log parity"
);
assert(
  /buildAgentVisitLoggedNotificationEvent/.test(apiSrc) &&
    !/actorUserId: insertRow\.agent_id/.test(apiSrc),
  "runtime.visit.notify.actor",
  "createAgentVisitWrite uses shared visit notification builder; no agent_id UUID"
);
assert(
  /GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_visits TO authenticated/.test(grantsMig) &&
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_product_intelligence TO authenticated/.test(
      grantsMig
    ) &&
    /REVOKE ALL ON TABLE public.agent_visits FROM anon/.test(grantsMig),
  "db.grants.authenticated",
  "durable authenticated grants; anon writes not granted"
);
assert(
  /ADD COLUMN IF NOT EXISTS event_id uuid/.test(notifyParityMig) &&
    /ADD COLUMN IF NOT EXISTS source_module text/.test(notifyParityMig) &&
    /ADD COLUMN IF NOT EXISTS payload_json jsonb/.test(notifyParityMig) &&
    /REVOKE ALL ON TABLE public.notification_events FROM anon/.test(notifyParityMig),
  "db.notify.parity_migration",
  "versioned foundation parity migration for legacy notification_events"
);

const {
  asUuidOrNull,
  buildAgentVisitLoggedNotificationEvent,
  buildNotificationEventInsertRows,
  buildNotificationDeliveryLogInsertRows,
  isUnknownNotificationColumnError,
  NOTIFICATION_DELIVERY_LOG_COLUMNS,
  NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS,
} = await import("../src/notifications/notificationEventInsert.js");

const visitNotify = buildAgentVisitLoggedNotificationEvent({
  tenantId: "f168b98f-47a6-42c3-b788-24c00436fac2",
  visitId: "VIS-CONTRACT-1",
  labId: "QA_LAB_001",
  visitType: "Follow-up",
  visitDate: "2026-08-16",
  userId: "AGT-001",
});
const builtVisit = buildNotificationEventInsertRows(visitNotify);
assert(builtVisit.ok, "notify.contract.build", "agent visit notification builds");
assert(
  builtVisit.foundation.event_type === "agent_visit_logged" &&
    builtVisit.foundation.source_module === "agent_visits" &&
    builtVisit.foundation.actor_user_id === null &&
    builtVisit.foundation.payload_json.visitId === "VIS-CONTRACT-1",
  "notify.contract.foundation",
  "foundation row: known event_type, no AGT-* in actor_user_id"
);
assert(
  builtVisit.legacy.title &&
    builtVisit.legacy.message &&
    builtVisit.legacy.payload?.visitId === "VIS-CONTRACT-1" &&
    !("actor_user_id" in builtVisit.legacy) &&
    !("source_module" in builtVisit.legacy) &&
    !("payload_json" in builtVisit.legacy),
  "notify.contract.legacy",
  "legacy stub row uses only GAP-006 columns"
);
assert(asUuidOrNull("AGT-001") === null, "notify.contract.agt_null", "AGT-* rejected as uuid");
assert(
  asUuidOrNull("bf8573d0-ac9d-4816-830d-f156bb857d17") ===
    "bf8573d0-ac9d-4816-830d-f156bb857d17",
  "notify.contract.uuid_ok",
  "auth uid accepted as actor"
);
assert(
  isUnknownNotificationColumnError({
    code: "PGRST204",
    message: "Could not find the 'actor_user_id' column of 'notification_events' in the schema cache",
  }),
  "notify.contract.pgrst204",
  "detects Production PostgREST unknown-column 400"
);

const deliveryBuilt = buildNotificationDeliveryLogInsertRows({
  tenantId: "f168b98f-47a6-42c3-b788-24c00436fac2",
  eventId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nowIso: "2026-08-16T12:00:00.000Z",
});
assert(deliveryBuilt.ok && deliveryBuilt.rows.length === 4, "notify.delivery.count", "4 channel rows");
const sample = deliveryBuilt.rows[0];
assert(
  sample.channel === "in_app" &&
    sample.status === "logged_in_app" &&
    sample.provider_message_id === null &&
    !("recipient" in sample) &&
    !("provider_response" in sample) &&
    !("error_message" in sample),
  "notify.delivery.qa_columns",
  "delivery rows match LIVE QA columns only"
);
const insertKeys = Object.keys(sample).sort();
const allowedInsertKeys = [...NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS].sort();
assert(
  insertKeys.length === allowedInsertKeys.length &&
    insertKeys.every((k, i) => k === allowedInsertKeys[i]) &&
    deliveryBuilt.rows.every((row) =>
      Object.keys(row).every((k) => NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS.includes(k))
    ),
  "notify.delivery.insert_allowlist",
  "generated delivery-log insert payload contains only canonical insert columns"
);
assert(
  !/recipient\s*:/.test(notifySrc) &&
    !/provider_response\s*:/.test(notifySrc) &&
    !/error_message\s*:/.test(notifySrc) &&
    /buildNotificationDeliveryLogInsertRows/.test(notifySrc),
  "notify.delivery.no_legacy_insert_fields",
  "createNotificationEvent must not send recipient/provider_response/error_message"
);
assert(
  NOTIFICATION_DELIVERY_LOG_COLUMNS.includes("provider_message_id") &&
    NOTIFICATION_DELIVERY_LOG_COLUMNS.includes("created_at") &&
    !NOTIFICATION_DELIVERY_LOG_COLUMNS.includes("recipient") &&
    !NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS.includes("recipient"),
  "notify.delivery.column_manifest",
  "canonical column manifest matches QA OpenAPI"
);
assert(
  !/from\("notification_delivery_log"\)/.test(visitPage),
  "notify.delivery.not_in_visit_tx",
  "AgentVisitPage does not write delivery_log (side effect only via createAgentVisitWrite)"
);

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
