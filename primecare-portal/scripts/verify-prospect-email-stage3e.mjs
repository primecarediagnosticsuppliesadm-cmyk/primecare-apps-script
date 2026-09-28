#!/usr/bin/env node
/**
 * PN-EMAIL Stage 3E — exact-row real-recipient lifecycle certification.
 * Static + policy unit tests only. No Production mutation. No send.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_BATCH_SIZE,
  STAGE2_CERT_DELIVERY_ID,
  STAGE2_CERT_MODE,
  STAGE3E_FORENSIC_DELIVERY_IDS,
  STAGE3E_LAB_NAME_PREFIX,
  STAGE3E_MODE,
  evaluateStage3eEnv,
  isCertificationRequest,
  isProductionBatchClaimForbidden,
  isProductionDispatchableEmail,
  isStage3eEventType,
  isStage3eLabNameEligible,
  isStage3eRecipientRole,
  isStage3eRequest,
  renderForEventType,
  resolveQaRecipient,
  shouldClaimRows,
  stage3eDeniedDelivery,
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

console.log("\n=== PN-EMAIL STAGE 3E EXACT-ROW LIFECYCLE CERT ===\n");

const migRel = "supabase/migrations/20260928230000_pn_email_stage3e_lifecycle_cert.sql";
const twinRel = "supabase/sql/pn_email_stage3e_lifecycle_cert.sql";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const fn = readRel("supabase/functions/dispatch-notification-email/index.ts");
const policy = readRel("supabase/functions/dispatch-notification-email/policy.js");
const pkg = readRel("package.json");
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const identity = readRel("supabase/migrations/20260928210000_pn_email_stage3br_event_identity.sql");
const pn3d = readRel("supabase/migrations/20260928220000_pn_email_stage3d_recipient_safety.sql");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /CREATE OR REPLACE FUNCTION public\.claim_notification_email_stage3e_delivery\(p_delivery_id uuid\)/.test(mig) &&
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(mig) &&
  /c02c0d63-9a0f-4ec6-8966-6035258364ad/.test(mig) &&
  /424796d2-3e78-438c-8fb6-ab5c3bb3e28b/.test(mig) &&
  /63561826-8bb3-4004-b857-b58c397b2aae/.test(mig) &&
  /3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(mig) &&
  /rejected_forensic/.test(mig) &&
  /rejected_stage2_cert/.test(mig) &&
  /rejected_event_type/.test(mig) &&
  /rejected_lab/.test(mig) &&
  /rejected_domain/.test(mig) &&
  /rejected_role/.test(mig) &&
  /already_sent/.test(mig) &&
  /prospect_email_is_production_dispatchable/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.claim_notification_email_stage3e_delivery\(uuid\) TO service_role/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.claim_notification_email_stage3e_delivery\(uuid\) FROM authenticated/.test(mig) &&
  !/DELETE FROM/.test(mig) &&
  !/EMAIL_ENABLED\s*=\s*true/.test(mig) &&
  !/cron\.schedule/.test(mig) &&
  !/claim_notification_email_deliveries\(/.test(mig)
) {
  pass("static.sql.exact_row", "exact-ID claim; forensic/Stage2 denied; no batch rewrite");
} else fail("static.sql.exact_row", "Stage 3E SQL contract incomplete");

if (
  /handleStage3eLifecycle/.test(fn) &&
  /isStage3eRequest/.test(fn) &&
  /claim_notification_email_stage3e_delivery/.test(fn) &&
  /production_freeze_batch_forbidden/.test(fn) &&
  /EMAIL_STAGE3E_INVOKE_SECRET/.test(fn) &&
  fn.indexOf("isStage3eRequest") < fn.indexOf("claim_notification_email_deliveries") &&
  fn.indexOf("isProductionBatchClaimForbidden") < fn.lastIndexOf("claim_notification_email_deliveries") &&
  /ignore_caller_payload/.test(fn) &&
  /to: intended/.test(fn) &&
  /renderForEventType/.test(fn)
) {
  pass("static.dispatcher.exact_row", "3E mode claims exact ID; Production batch forbidden");
} else fail("static.dispatcher.exact_row", "dispatcher Stage 3E gate missing");

if (!isStage3eRequest({ mode: STAGE2_CERT_MODE }) && isStage3eRequest({ mode: STAGE3E_MODE })) {
  pass("unit.mode", "Stage 3E mode is distinct from Stage 2");
} else fail("unit.mode", "mode collision");

if (isCertificationRequest({ mode: STAGE2_CERT_MODE }) && !isCertificationRequest({ mode: STAGE3E_MODE })) {
  pass("unit.mode.stage2", "Stage 2 cert mode unchanged");
} else fail("unit.mode.stage2", "Stage 2 mode gate broken");

const forensicReasons = STAGE3E_FORENSIC_DELIVERY_IDS.map((id) => stage3eDeniedDelivery(id).reason);
if (
  forensicReasons.every((r) => r === "rejected_forensic") &&
  stage3eDeniedDelivery(STAGE2_CERT_DELIVERY_ID).reason === "rejected_stage2_cert" &&
  stage3eDeniedDelivery("").reason === "missing_delivery_id" &&
  stage3eDeniedDelivery("00000000-0000-0000-0000-000000000000").denied === false
) {
  pass("unit.B.forensic_ids", "old forensic and Stage 2 IDs rejected before claim");
} else fail("unit.B.forensic_ids", "deny list incomplete");

if (
  isStage3eLabNameEligible("PN EMAIL STAGE3E REAL RECIPIENT CERT — DO NOT CONTACT") &&
  !isStage3eLabNameEligible("LAB-P-3CD3204FEFC8") &&
  !isStage3eLabNameEligible("Some customer lab")
) {
  pass("unit.B.lab_name", "only Stage 3E synthetic lab name is eligible");
} else fail("unit.B.lab_name", "lab-name gate failed");

if (
  isStage3eEventType("prospect_created") &&
  isStage3eEventType("prospect_activated") &&
  !isStage3eEventType("agent_visit_logged") &&
  !isStage3eEventType("pn_email_stage2_certification")
) {
  pass("unit.B.event_type", "wrong event types rejected");
} else fail("unit.B.event_type", "event-type gate failed");

if (
  isStage3eRecipientRole("prospect_created", "executive") &&
  isStage3eRecipientRole("prospect_activated", "agent") &&
  !isStage3eRecipientRole("prospect_created", "lab") &&
  !isStage3eRecipientRole("prospect_activated", "customer") &&
  !isStage3eRecipientRole("prospect_activated", "executive")
) {
  pass("unit.B.roles", "lab/customer roles rejected; HQ not activation recipient");
} else fail("unit.B.roles", "role gate failed");

if (
  isProductionDispatchableEmail("ops@gmail.com") &&
  isProductionDispatchableEmail("ops@primecarediagnostics.in") &&
  !isProductionDispatchableEmail("admin@primecare.local")
) {
  pass("unit.B.domain", ".local rejected; Gmail and company domains eligible");
} else fail("unit.B.domain", "dispatchable gate failed");

const disabled = evaluateStage3eEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  stage3eMode: true,
});
if (!shouldClaimRows("false") && disabled.reason === "email_disabled") {
  pass("unit.B.email_disabled", "EMAIL_ENABLED=false blocks Stage 3E send");
} else fail("unit.B.email_disabled", JSON.stringify(disabled));

const qaForbidden = evaluateStage3eEnv({
  emailEnabled: "true",
  appEnv: "prod",
  qaMode: "true",
  stage3eMode: true,
});
if (qaForbidden.reason === "stage3e_qa_mode_forbidden") {
  pass("unit.B.qa_forbidden", "EMAIL_QA_MODE=true is not a 3E send path");
} else fail("unit.B.qa_forbidden", JSON.stringify(qaForbidden));

if (
  isProductionBatchClaimForbidden({ appEnv: "prod", qaMode: "false" }) &&
  !isProductionBatchClaimForbidden({ appEnv: "qa", qaMode: "false" })
) {
  pass("unit.B.no_batch", "Production batch claim remains forbidden");
} else fail("unit.B.no_batch", "batch freeze missing");

const freeze = resolveQaRecipient({
  intendedEmail: "founder@gmail.com",
  qaMode: "false",
  appEnv: "prod",
  testRecipient: "sink@example.com",
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.D.freeze", "production_freeze still suppresses normal Production send");
} else fail("unit.D.freeze", JSON.stringify(freeze));

const createdMail = renderForEventType("prospect_created", {
  payload: { lab_name: "PN EMAIL STAGE3E REAL RECIPIENT CERT — DO NOT CONTACT" },
  appPublicUrl: "https://app.primecarediagnostics.in",
});
if (
  createdMail.ok &&
  createdMail.subject.includes("PN EMAIL STAGE3E REAL RECIPIENT CERT") &&
  createdMail.text.includes("https://app.primecarediagnostics.in/labs") &&
  !/attacker@/.test(fn.split("handleStage3eLifecycle")[1] || "")
) {
  pass("unit.render", "server renders lifecycle template; caller To cannot become subject");
} else fail("unit.render", "template/render contract failed");

if (CLAIM_BATCH_SIZE === 10 && /p_limit: CLAIM_BATCH_SIZE/.test(fn)) {
  pass("unit.batch_size", "normal claim batch remains 10 and unused in Production");
} else fail("unit.batch_size", "batch contract changed");

if (
  /notification_events_assign_event_id/.test(identity) &&
  /prospect_email_is_production_dispatchable/.test(pn3d) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(mig) &&
  !/AGT_VISHWAK/.test(mig)
) {
  pass("static.prior_preserved", "3B-R identity and 3D address policy remain; no email hard-code");
} else fail("static.prior_preserved", "prior stage contract missing");

if (/My Business/.test(ae1a) && /verify:ae-1a/.test(pkg) && !/AE-1B/.test(mig) && !/VE-4/.test(mig)) {
  pass("static.ae1a", "AE-1A preserved; no AE-1B/C/VE-4");
} else fail("static.ae1a", "scope drift");

if (!/zipuzmfkwwucbchlphcj/.test(mig) && !/EMAIL_QA_MODE=true/.test(mig) && !/EMAIL_QA_MODE=true/.test(fn)) {
  pass("static.qa", "QA project not targeted; QA mode not enabled");
} else fail("static.qa", "QA referenced");

if (/STAGE3E_FORENSIC_DELIVERY_IDS/.test(policy) && STAGE3E_LAB_NAME_PREFIX.startsWith("PN EMAIL STAGE3E")) {
  pass("static.policy.constants", "forensic deny list and lab prefix exported");
} else fail("static.policy.constants", "policy constants missing");

console.log(failures ? `\nSTAGE 3E: BLOCKED (${failures})\n` : "\nSTAGE 3E: PASS\n");
process.exit(failures ? 1 : 0);
