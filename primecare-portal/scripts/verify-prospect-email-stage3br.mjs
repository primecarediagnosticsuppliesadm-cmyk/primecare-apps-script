#!/usr/bin/env node
/**
 * PN-EMAIL Stage 3B-R — notification event_id identity repair.
 * Static + policy unit tests only. No Production mutation. No send.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_BATCH_SIZE,
  evaluateProductionCertificationEnv,
  resolveQaRecipient,
  shouldClaimRows,
} from "../supabase/functions/dispatch-notification-email/policy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function readRel(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

console.log("\n=== PN-EMAIL STAGE 3B-R EVENT IDENTITY ===\n");

const migRel = "supabase/migrations/20260928210000_pn_email_stage3br_event_identity.sql";
const twinRel = "supabase/sql/pn_email_stage3br_event_identity.sql";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const pn1a = readRel("supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql");
const pn1b1 = readRel("supabase/migrations/20260913010000_pn1b1_prospect_email_delivery_queue.sql");
const pn1b2 = readRel("supabase/migrations/20260913020000_pn1b2_email_dispatch_claim.sql");
const pn2a = readRel("supabase/migrations/20260928120000_pn_email_stage2a_certification.sql");
const fn = readRel("supabase/functions/dispatch-notification-email/index.ts");
const insertSrc = readRel("src/notifications/notificationEventInsert.js");
const createSrc = readRel("src/notifications/createNotificationEvent.js");
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const pkg = readRel("package.json");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /CREATE OR REPLACE FUNCTION public\.notification_events_assign_event_id\(\)/.test(mig) &&
  /TG_OP = 'INSERT' AND NEW\.event_id IS NULL/.test(mig) &&
  /NEW\.event_id := COALESCE\(NEW\.id, gen_random_uuid\(\)\)/.test(mig) &&
  /BEFORE INSERT ON public\.notification_events/.test(mig) &&
  /CANONICAL EVENT IDENTITY = event_id/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.notification_events_assign_event_id\(\) FROM authenticated/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.notification_events_assign_event_id\(\) FROM service_role/.test(mig) &&
  !/ALTER TABLE[\s\S]*NOT NULL/.test(mig) &&
  !/CHECK \(.*event_id = .*id/.test(mig) &&
  !/UPDATE public\.notification_events/.test(mig) &&
  !/DELETE FROM/.test(mig) &&
  !/DROP TABLE/.test(mig) &&
  !/EMAIL_ENABLED\s*=\s*true/.test(mig) &&
  !/cron\.schedule/.test(mig) &&
  !/resend/i.test(mig)
) {
  pass("static.sql.identity", "BEFORE INSERT fills omitted event_id; no equality CHECK; no historical rewrite");
} else fail("static.sql.identity", "identity SQL contract incomplete");

if (
  /PERFORM public\.enqueue_prospect_email_deliveries\(NEW\.event_id\)/.test(pn1b1) &&
  /IF p_event_id IS NULL THEN/.test(pn1b1) &&
  /WHERE e\.event_id = p_event_id/.test(pn1b1)
) {
  pass("static.enqueue_uses_event_id", "enqueue trigger and helper still use event_id, not id");
} else fail("static.enqueue_uses_event_id", "enqueue identifier contract changed");

if (
  /prospect_created/.test(pn1a) &&
  /prospect_activated/.test(pn1a) &&
  /INSERT INTO public\.notification_events \(/.test(pn1a) &&
  /RAISE EXCEPTION 'prospect_notify_forbidden'/.test(pn1a) &&
  /notification_events_prospect_lifecycle_uidx/.test(pn1a)
) {
  pass("static.lifecycle_emit", "future prospect_created/activated still emit through server helper + unique index");
} else fail("static.lifecycle_emit", "lifecycle emit contract missing");

if (
  /notification_delivery_log_email_recipient_uidx/.test(pn1b1) &&
  /WHEN unique_violation THEN/.test(pn1b1)
) {
  pass("static.no_duplicate_delivery", "enqueue unique index swallows duplicate recipient rows");
} else fail("static.no_duplicate_delivery", "duplicate delivery protection missing");

if (/SERVER_AUTHORITATIVE_NOTIFICATION_EVENT_TYPES/.test(insertSrc) && /Server-authoritative event_type/.test(insertSrc)) {
  pass("static.caller_cannot_forge", "client builder rejects protected prospect notification types");
} else fail("static.caller_cannot_forge", "client can still construct prospect_* events");

if (/Client-generated event_id/.test(createSrc) && /event_id: eventId/.test(createSrc)) {
  pass("static.client_supplies_event_id", "non-lifecycle client path still supplies event_id");
} else fail("static.client_supplies_event_id", "client event_id path missing");

if (
  /LIMIT v_limit/.test(pn1b2) &&
  /v_limit := LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 10\)/.test(pn2a) &&
  /d\.certification_kind IS NULL/.test(pn2a) &&
  /p_limit: CLAIM_BATCH_SIZE/.test(fn) &&
  CLAIM_BATCH_SIZE === 10
) {
  pass("static.batch_unchanged", "normal claim still capped at 10 and excludes cert rows");
} else fail("static.batch_unchanged", "normal batch contract changed");

if (
  /3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(readRel("supabase/migrations/20260928140000_pn_email_stage2c_certification_repair.sql")) &&
  !/3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(mig)
) {
  pass("static.stage2_untouched", "Stage 2 cert row id not referenced by 3B-R migration");
} else fail("static.stage2_untouched", "Stage 2 cert identity may be rewritten");

const freeze = resolveQaRecipient({
  intendedEmail: "hq@example.com",
  qaMode: "false",
  appEnv: "prod",
  testRecipient: "sink@example.com",
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.production_freeze", "prod + EMAIL_QA_MODE=false remains production_freeze");
} else fail("unit.production_freeze", JSON.stringify(freeze));

const disabled = evaluateProductionCertificationEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: "primecarediagnosticsuppliesadm@gmail.com",
});
if (!shouldClaimRows("false") && !disabled.ok && disabled.reason === "email_disabled") {
  pass("unit.email_disabled_blocks_claim", "EMAIL_ENABLED=false still blocks claim/send");
} else fail("unit.email_disabled_blocks_claim", JSON.stringify(disabled));

if (/My Business/.test(ae1a) && /verify:ae-1a/.test(pkg) && !/AE-1B/.test(mig) && !/AE-1C/.test(mig) && !/VE-4/.test(mig)) {
  pass("static.ae1a_untouched", "AE-1A page present; 3B-R does not start AE-1B/C or VE-4");
} else fail("static.ae1a_untouched", "AE-1A/adjacent scope drift");

if (!/zipuzmfkwwucbchlphcj/.test(mig) && !/EMAIL_QA_MODE=true/.test(mig)) {
  pass("static.qa_untouched", "migration does not target QA project or enable QA mode");
} else fail("static.qa_untouched", "QA project referenced in identity repair");

console.log(failures ? `\nSTAGE 3B-R: BLOCKED (${failures})\n` : "\nSTAGE 3B-R: PASS\n");
process.exit(failures ? 1 : 0);
