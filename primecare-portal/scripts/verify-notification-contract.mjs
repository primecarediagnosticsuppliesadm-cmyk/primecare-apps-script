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

console.log(failures ? `\nNOTIFICATION CONTRACT: BLOCKED (${failures})\n` : "\nNOTIFICATION CONTRACT: PASS\n");
process.exit(failures ? 1 : 0);
