#!/usr/bin/env node
/**
 * Notification contract certification (static, read-only).
 * Extracted/aligned with agent-visit notification assertions — no DB mutation.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_FOUNDATION_MANIFEST } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}
function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

console.log("\n=== PRIMECARE NOTIFICATION CONTRACT ===\n");

const createSrc = read("src/notifications/createNotificationEvent.js");
const insertSrc = read("src/notifications/notificationEventInsert.js");
const deliveryWrite = existsSync(resolve(root, "src/notifications/notificationDeliveryLogWrite.js"))
  ? read("src/notifications/notificationDeliveryLogWrite.js")
  : "";
const visitPage = read("src/pages/AgentVisitPage.jsx");
const fireSrc = read("src/notifications/fireNotificationEvent.js");

if (/NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS/.test(insertSrc)) {
  pass("payload.allowlist", "delivery insert allowlist exported");
} else fail("payload.allowlist", "missing NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS");

for (const col of RELEASE_FOUNDATION_MANIFEST.forbiddenDeliveryColumns) {
  if (new RegExp(`${col}\\s*:`).test(createSrc) || new RegExp(`${col}\\s*:`).test(insertSrc)) {
    fail(`payload.legacy.${col}`, `legacy field still in insert path`);
  } else pass(`payload.legacy.${col}`, "not in insert contract");
}

if (/asUuidOrNull/.test(insertSrc) && /actor_user_id: actorUserId/.test(insertSrc)) {
  pass("uuid.actor", "non-UUID actors nullified for uuid columns");
} else fail("uuid.actor", "UUID guard missing");

if (
  /from "@\/api\/supabaseClient\.js"/.test(createSrc) &&
  /insertNotificationDeliveryLogRows/.test(createSrc) &&
  /from "@\/api\/supabaseClient\.js"/.test(deliveryWrite) &&
  !/\bfetch\s*\(/.test(createSrc) &&
  !/\bfetch\s*\(/.test(deliveryWrite) &&
  !/rest\/v1\/notification_/.test(createSrc)
) {
  pass("client.canonical", "browser writes use canonical supabase client");
} else fail("client.canonical", "raw HTTP or missing canonical client path");

if (
  /\.insert\(\[foundationRow\]\)/.test(createSrc) &&
  !/\.insert\(\[foundationRow\]\)\s*\.select\(/.test(createSrc) &&
  /Client-generated event_id/.test(createSrc)
) {
  pass("insert.no_returning", "agent admin-targeted inserts omit SELECT RETURNING");
} else fail("insert.no_returning", "RETURNING still required (SELECT RLS risk)");

if (
  /void createNotificationEvent/.test(fireSrc) &&
  !/from\("notification_delivery_log"\)/.test(visitPage) &&
  /fireNotificationEvent/.test(read("src/api/primecareSupabaseApi.js"))
) {
  pass("fire_and_forget", "delivery/event side effects outside visit SoT path");
} else fail("fire_and_forget", "notification writes may be on visit critical path");

for (const mig of [
  "20260816140000_notification_events_foundation_parity.sql",
  "20260816145000_notification_event_visibility_helper_parity.sql",
  "20260816150000_notification_delivery_log_parity.sql",
  "20260912200000_pn1a_prospect_in_app_notifications.sql",
]) {
  if (existsSync(resolve(root, "supabase/migrations", mig))) pass(`db.${mig}`, "versioned");
  else fail(`db.${mig}`, "missing migration");
}

const pnRel = "supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql";
const pnTwinRel = "supabase/sql/pn1a_prospect_in_app_notifications.sql";
const pn = existsSync(resolve(root, pnRel)) ? read(pnRel) : "";
const pnTwin = existsSync(resolve(root, pnTwinRel)) ? read(pnTwinRel) : "";
if (pn && pn === pnTwin) pass("pn1a.twin", "migration matches SQL twin");
else fail("pn1a.twin", "PN-1A migration / twin missing or mismatched");

if (
  /CREATE OR REPLACE FUNCTION public\.emit_prospect_in_app_notification/.test(pn) &&
  /REVOKE ALL ON FUNCTION public\.emit_prospect_in_app_notification[\s\S]*FROM authenticated/.test(pn) &&
  /RAISE EXCEPTION 'prospect_notify_forbidden'/.test(pn) &&
  /notification_events_prospect_lifecycle_uidx/.test(pn) &&
  /EXCEPTION\s+WHEN unique_violation THEN/.test(pn) &&
  /EXCEPTION\s+WHEN OTHERS THEN/.test(pn)
) {
  pass("pn1a.server", "helper + unique index + spoof trigger + isolated unique_violation");
} else {
  fail("pn1a.server", "PN-1A server contract incomplete");
}

if (/resend/i.test(pn) || /sendgrid/i.test(pn) || /smtp/i.test(pn) || /email_placeholder/.test(pn)) {
  fail("pn1a.no_email", "PN-1A must not add email delivery");
} else {
  pass("pn1a.no_email", "in-app only");
}

const pn1bRel = "supabase/migrations/20260913010000_pn1b1_prospect_email_delivery_queue.sql";
const pn1bTwinRel = "supabase/sql/pn1b1_prospect_email_delivery_queue.sql";
const pn1b = existsSync(resolve(root, pn1bRel)) ? read(pn1bRel) : "";
const pn1bTwin = existsSync(resolve(root, pn1bTwinRel)) ? read(pn1bTwinRel) : "";
if (pn1b && pn1b === pn1bTwin) pass("pn1b1.twin", "PN-1B1 migration matches SQL twin");
else fail("pn1b1.twin", "PN-1B1 migration / twin missing or mismatched");

if (
  /enqueue_prospect_email_deliveries/.test(pn1b) &&
  /REVOKE ALL ON FUNCTION public\.enqueue_prospect_email_deliveries[\s\S]*FROM authenticated/.test(pn1b) &&
  /email_delivery_forbidden/.test(pn1b) &&
  /notification_delivery_log_email_recipient_uidx/.test(pn1b) &&
  !/resend/i.test(pn1b) &&
  !/sendgrid/i.test(pn1b) &&
  !/postmark/i.test(pn1b) &&
  !/smtp/i.test(pn1b) &&
  !/\bfetch\s*\(/.test(pn1b) &&
  !/pg_net/.test(pn1b) &&
  !/cron\.schedule/.test(pn1b)
) {
  pass("pn1b1.no_send", "queue helper present; no provider/send mechanism");
} else {
  fail("pn1b1.no_send", "PN-1B1 send surface or helper contract missing");
}

const pn1b2Rel = "supabase/migrations/20260913020000_pn1b2_email_dispatch_claim.sql";
const pn1b2TwinRel = "supabase/sql/pn1b2_email_dispatch_claim.sql";
const pn1b2 = existsSync(resolve(root, pn1b2Rel)) ? read(pn1b2Rel) : "";
const pn1b2Twin = existsSync(resolve(root, pn1b2TwinRel)) ? read(pn1b2TwinRel) : "";
if (pn1b2 && pn1b2 === pn1b2Twin) pass("pn1b2.twin", "PN-1B2 migration matches SQL twin");
else fail("pn1b2.twin", "PN-1B2 migration / twin missing or mismatched");

const dispatchSrc = existsSync(resolve(root, "supabase/functions/dispatch-notification-email/index.ts"))
  ? read("supabase/functions/dispatch-notification-email/index.ts")
  : "";
const configToml = existsSync(resolve(root, "supabase/config.toml")) ? read("supabase/config.toml") : "";
if (
  /EMAIL_DISPATCH_CRON_SECRET/.test(dispatchSrc) &&
  /ignore_caller_payload/.test(dispatchSrc) &&
  /Idempotency-Key/.test(dispatchSrc) &&
  /shouldClaimRows/.test(dispatchSrc) &&
  /verify_jwt = false/.test(configToml.split("[functions.dispatch-notification-email]")[1] || "") &&
  !/VITE_EMAIL_/.test(dispatchSrc)
) {
  pass("pn1b2.dispatcher", "cron-secret auth, no-claim when disabled, no VITE secrets");
} else {
  fail("pn1b2.dispatcher", "dispatcher contract incomplete");
}

const constants = read("src/notifications/notificationConstants.js");
const insertSrc2 = insertSrc;
const centerPage = read("src/pages/NotificationCenterPage.jsx");
const activityEngine = read("src/operations/activityCenterEngine.js");
const bounds = read("src/api/hqReadBounds.js");
const notifyApi = read("src/api/notificationApi.js");

if (
  /prospect_created/.test(constants) &&
  /prospect_activated/.test(constants) &&
  /SERVER_AUTHORITATIVE_NOTIFICATION_EVENT_TYPES/.test(constants) &&
  /"labs"/.test(constants)
) {
  pass("pn1a.constants", "event types + server-authoritative allowlist + labs module");
} else {
  fail("pn1a.constants", "notification constants missing Prospect types");
}

if (/Server-authoritative event_type/.test(insertSrc2) && /SERVER_AUTHORITATIVE_NOTIFICATION_EVENT_TYPES/.test(insertSrc2)) {
  pass("pn1a.client_builder", "client insert builder rejects prospect_* types");
} else {
  fail("pn1a.client_builder", "client builder can still construct prospect_* rows");
}

if (
  /"email"/.test(constants) &&
  /SERVER_QUEUED_NOTIFICATION_CHANNELS/.test(constants) &&
  /ch === "email"/.test(insertSrc2)
) {
  pass("pn1b1.client_no_email_insert", "client builder drops channel=email");
} else {
  fail("pn1b1.client_no_email_insert", "client may still construct email delivery rows");
}

const labSafeBlock = centerPage.split("const LAB_SAFE_EVENT_TYPES")[1]?.split("function")[0] || "";
if (
  /New Prospect Added/.test(centerPage) &&
  /Prospect Approved/.test(centerPage) &&
  /Open Lab/.test(centerPage) &&
  !/prospect_created/.test(labSafeBlock) &&
  !/prospect_activated/.test(labSafeBlock)
) {
  pass("pn1a.ui.copy", "Activity Center / Agent copy present; Lab filter excludes Prospect events");
} else {
  fail("pn1a.ui.copy", "UI copy or Lab filter contract missing");
}

if (/prospect_created/.test(activityEngine) && /was added by/.test(activityEngine) && /has been approved/.test(activityEngine)) {
  pass("pn1a.activity_sentences", "HQ Activity Center sentences for Prospect events");
} else {
  fail("pn1a.activity_sentences", "activityCenterEngine missing Prospect sentences");
}

if (
  /HQ_NOTIFICATION_EVENT_LIST_COLUMNS/.test(bounds) &&
  /HQ_NOTIFICATION_EVENT_LIST_COLUMNS/.test(notifyApi) &&
  !/\.select\("\*"\)/.test(notifyApi)
) {
  pass("pn1a.bounded_read", "notification_events list uses bounded columns");
} else {
  fail("pn1a.bounded_read", "SELECT * still on notification read path");
}

const pn2aRel = "supabase/migrations/20260928120000_pn_email_stage2a_certification.sql";
const pn2aTwinRel = "supabase/sql/pn_email_stage2a_certification.sql";
const pn2a = existsSync(resolve(root, pn2aRel)) ? read(pn2aRel) : "";
const pn2aTwin = existsSync(resolve(root, pn2aTwinRel)) ? read(pn2aTwinRel) : "";
if (pn2a && pn2a === pn2aTwin) pass("pn2a.twin", "Stage 2A migration matches SQL twin");
else fail("pn2a.twin", "Stage 2A migration / twin missing or mismatched");

if (
  /certification_kind/.test(pn2a) &&
  /claim_notification_email_certification_delivery/.test(pn2a) &&
  /d\.certification_kind IS NULL/.test(pn2a) &&
  /REVOKE ALL ON FUNCTION public\.claim_notification_email_certification_delivery[\s\S]*FROM authenticated/.test(pn2a) &&
  /GRANT EXECUTE ON FUNCTION public\.claim_notification_email_certification_delivery[\s\S]*TO service_role/.test(pn2a) &&
  !/DROP TABLE/.test(pn2a) &&
  !/DELETE FROM public\.notification_delivery_log/.test(pn2a)
) {
  pass("pn2a.safety", "marker + exact-ID claim; batch excludes cert rows; no destructive rewrite");
} else {
  fail("pn2a.safety", "Stage 2A SQL safety contract incomplete");
}

if (
  /EMAIL_PROD_TEST_RECIPIENT/.test(dispatchSrc) &&
  /handleProductionCertification/.test(dispatchSrc) &&
  /isCertificationRequest/.test(dispatchSrc) &&
  /evaluateProductionCertificationEnv/.test(dispatchSrc) &&
  /create_pn_email_stage2_certification_delivery/.test(dispatchSrc) &&
  /claim_notification_email_certification_delivery/.test(dispatchSrc) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(dispatchSrc)
) {
  pass("pn2a.dispatcher", "cert path uses secret recipient; Gmail not hardcoded");
} else {
  fail("pn2a.dispatcher", "Stage 2A dispatcher contract incomplete");
}

if (!/pn_email_stage2_certification/.test(constants)) {
  pass("pn2a.client_unaware", "browser constants do not expose certification event type");
} else {
  fail("pn2a.client_unaware", "do not add certification event type to client constants");
}

const pn2cRel = "supabase/migrations/20260928140000_pn_email_stage2c_certification_repair.sql";
const pn2cTwinRel = "supabase/sql/pn_email_stage2c_certification_repair.sql";
const pn2c = existsSync(resolve(root, pn2cRel)) ? read(pn2cRel) : "";
const pn2cTwin = existsSync(resolve(root, pn2cTwinRel)) ? read(pn2cTwinRel) : "";
if (pn2c && pn2c === pn2cTwin) pass("pn2c.twin", "Stage 2C migration matches SQL twin");
else fail("pn2c.twin", "Stage 2C migration / twin missing or mismatched");

if (
  /INTO v_existing_id, v_existing_event, v_existing_recipient/.test(pn2c) &&
  !/INTO v_delivery_id, v_event_id, v_email,/.test(pn2c) &&
  /3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(pn2c) &&
  /RAISE EXCEPTION 'stage2c_cert_row_already_sent'/.test(pn2c) &&
  !/DELETE FROM public\.notification_delivery_log/.test(pn2c)
) {
  pass("pn2c.safety", "input recipient preserved; UNSENT repair guarded; SENT blocked");
} else {
  fail("pn2c.safety", "Stage 2C SQL safety contract incomplete");
}

const pn3brRel = "supabase/migrations/20260928210000_pn_email_stage3br_event_identity.sql";
const pn3brTwinRel = "supabase/sql/pn_email_stage3br_event_identity.sql";
const pn3br = existsSync(resolve(root, pn3brRel)) ? read(pn3brRel) : "";
const pn3brTwin = existsSync(resolve(root, pn3brTwinRel)) ? read(pn3brTwinRel) : "";
if (pn3br && pn3br === pn3brTwin) pass("pn3br.twin", "Stage 3B-R migration matches SQL twin");
else fail("pn3br.twin", "Stage 3B-R migration / twin missing or mismatched");

if (
  /NEW\.event_id := COALESCE\(NEW\.id, gen_random_uuid\(\)\)/.test(pn3br) &&
  /BEFORE INSERT ON public\.notification_events/.test(pn3br) &&
  /CANONICAL EVENT IDENTITY = event_id/.test(pn3br) &&
  !/UPDATE public\.notification_events/.test(pn3br) &&
  !/DELETE FROM/.test(pn3br)
) {
  pass("pn3br.identity", "BEFORE INSERT fills omitted event_id; no historical rewrite");
} else {
  fail("pn3br.identity", "Stage 3B-R identity contract incomplete");
}

const pn3dRel = "supabase/migrations/20260928220000_pn_email_stage3d_recipient_safety.sql";
const pn3dTwinRel = "supabase/sql/pn_email_stage3d_recipient_safety.sql";
const pn3d = existsSync(resolve(root, pn3dRel)) ? read(pn3dRel) : "";
const pn3dTwin = existsSync(resolve(root, pn3dTwinRel)) ? read(pn3dTwinRel) : "";
if (pn3d && pn3d === pn3dTwin) pass("pn3d.twin", "Stage 3D migration matches SQL twin");
else fail("pn3d.twin", "Stage 3D migration / twin missing or mismatched");

if (
  /prospect_email_is_production_dispatchable/.test(pn3d) &&
  /non_dispatchable_domain/.test(pn3d) &&
  /NOT LIKE '%\.local'/.test(pn3d) &&
  !/AGT_VISHWAK/.test(pn3d) &&
  !/PROD_AGENT_001/.test(pn3d)
) {
  pass("pn3d.safety", "canonical .local rejection; no fixture identity hard-codes");
} else {
  fail("pn3d.safety", "Stage 3D recipient-safety contract incomplete");
}

const pn3eRel = "supabase/migrations/20260928230000_pn_email_stage3e_lifecycle_cert.sql";
const pn3eTwinRel = "supabase/sql/pn_email_stage3e_lifecycle_cert.sql";
const pn3e = existsSync(resolve(root, pn3eRel)) ? read(pn3eRel) : "";
const pn3eTwin = existsSync(resolve(root, pn3eTwinRel)) ? read(pn3eTwinRel) : "";
if (pn3e && pn3e === pn3eTwin) pass("pn3e.twin", "Stage 3E migration matches SQL twin");
else fail("pn3e.twin", "Stage 3E migration / twin missing or mismatched");

if (
  /claim_notification_email_stage3e_delivery/.test(pn3e) &&
  /rejected_forensic/.test(pn3e) &&
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(pn3e) &&
  /production_freeze_batch_forbidden/.test(dispatchSrc) &&
  /handleStage3eLifecycle/.test(dispatchSrc) &&
  !/claim_notification_email_deliveries\(/.test(pn3e)
) {
  pass("pn3e.safety", "exact-row Stage 3E claim; Production batch remains forbidden");
} else {
  fail("pn3e.safety", "Stage 3E exact-row contract incomplete");
}

const pn3fRel = "supabase/migrations/20260928240000_pn_email_stage3f_notification_routing.sql";
const pn3fTwinRel = "supabase/sql/pn_email_stage3f_notification_routing.sql";
const pn3f = existsSync(resolve(root, pn3fRel)) ? read(pn3fRel) : "";
const pn3fTwin = existsSync(resolve(root, pn3fTwinRel)) ? read(pn3fTwinRel) : "";
if (pn3f && pn3f === pn3fTwin) pass("pn3f.twin", "Stage 3F migration matches SQL twin");
else fail("pn3f.twin", "Stage 3F migration / twin missing or mismatched");

if (
  /notification_email_routes/.test(pn3f) &&
  /resolve_prospect_lifecycle_email_route/.test(pn3f) &&
  /primecarediagnosticsuppliesadm@gmail\.com/.test(pn3f) &&
  /vishu\.sen80@gmail\.com/.test(pn3f) &&
  /missing_route/.test(pn3f) &&
  /b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64/.test(pn3f) &&
  !/CREATE TABLE IF NOT EXISTS public\.notification_preferences/.test(pn3f) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(dispatchSrc) &&
  !/vishu\.sen80@gmail\.com/.test(dispatchSrc)
) {
  pass("pn3f.routing", "explicit tenant/event/agent routes; destinations not in dispatcher");
} else {
  fail("pn3f.routing", "Stage 3F routing contract incomplete");
}

const pn3frRel = "supabase/migrations/20260928250000_pn_email_stage3fr_lab_name_eligibility.sql";
const pn3frTwinRel = "supabase/sql/pn_email_stage3fr_lab_name_eligibility.sql";
const pn3fr = existsSync(resolve(root, pn3frRel)) ? read(pn3frRel) : "";
const pn3frTwin = existsSync(resolve(root, pn3frTwinRel)) ? read(pn3frTwinRel) : "";
if (pn3fr && pn3fr === pn3frTwin) pass("pn3fr.twin", "Stage 3F-R eligibility migration matches SQL twin");
else fail("pn3fr.twin", "Stage 3F-R migration / twin missing or mismatched");

if (
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(pn3fr) &&
  /PN EMAIL STAGE3F REAL RECIPIENT CERT%/.test(pn3fr) &&
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(pn3e)
) {
  pass("pn3fr.prefixes", "exact-row prefixes are explicit Stage 3E and Stage 3F only");
} else {
  fail("pn3fr.prefixes", "Stage 3F-R prefix contract incomplete");
}

console.log(failures ? `\nNOTIFICATION CONTRACT: BLOCKED (${failures})\n` : "\nNOTIFICATION CONTRACT: PASS\n");
process.exit(failures ? 1 : 0);
