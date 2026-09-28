#!/usr/bin/env node
/**
 * PN-EMAIL Stage 3F — explicit operational recipient routing.
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
  STAGE3E_MODE,
  STAGE3F_LAB_NAME_PREFIX,
  evaluateStage3eEnv,
  isProductionBatchClaimForbidden,
  isProductionDispatchableEmail,
  isStage3eLabNameEligible,
  isStage3eRecipientRole,
  isStage3eRequest,
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

console.log("\n=== PN-EMAIL STAGE 3F NOTIFICATION ROUTING ===\n");

const migRel = "supabase/migrations/20260928240000_pn_email_stage3f_notification_routing.sql";
const twinRel = "supabase/sql/pn_email_stage3f_notification_routing.sql";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const fn = readRel("supabase/functions/dispatch-notification-email/index.ts");
const policy = readRel("supabase/functions/dispatch-notification-email/policy.js");
const pkg = readRel("package.json");
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const identity = readRel("supabase/migrations/20260928210000_pn_email_stage3br_event_identity.sql");
const pn3d = readRel("supabase/migrations/20260928220000_pn_email_stage3d_recipient_safety.sql");
const pn3e = readRel("supabase/migrations/20260928230000_pn_email_stage3e_lifecycle_cert.sql");
const prefs = readRel("supabase/sql/notifications_foundation_migration.sql");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /CREATE TABLE IF NOT EXISTS public\.notification_email_routes/.test(mig) &&
  /recipient_kind text NOT NULL/.test(mig) &&
  /event_type IN \('prospect_created', 'prospect_activated'\)/.test(mig) &&
  /resolve_prospect_lifecycle_email_route/.test(mig) &&
  /enqueue_prospect_email_deliveries/.test(mig) &&
  /claim_notification_email_stage3e_delivery/.test(mig) &&
  /primecarediagnosticsuppliesadm@gmail\.com/.test(mig) &&
  /vishu\.sen80@gmail\.com/.test(mig) &&
  /AGT_VISHWAK_RATA_36CC/.test(mig) &&
  /missing_route/.test(mig) &&
  /inactive_route/.test(mig) &&
  /non_dispatchable_domain/.test(mig) &&
  /b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64/.test(mig) &&
  /notification_email_routes_select_hq/.test(mig) &&
  /current_user_role\(\) IN \('admin', 'executive'\)/.test(mig) &&
  !/CREATE TABLE IF NOT EXISTS public\.notification_preferences/.test(mig) &&
  !/DELETE FROM public\.notification_delivery_log/.test(mig) &&
  !/UPDATE public\.profiles/.test(mig) &&
  !/EMAIL_ENABLED\s*=\s*true/.test(mig) &&
  !/cron\.schedule/.test(mig)
) {
  pass("static.sql.routing", "tenant/event/agent routes; HQ RLS; seed; no prefs/profile rewrite");
} else fail("static.sql.routing", "Stage 3F SQL routing contract incomplete");

if (
  /FROM public\.resolve_prospect_lifecycle_email_route\(\s*v_event\.tenant_id,\s*'prospect_created',\s*NULL/.test(mig) &&
  /FROM public\.resolve_prospect_lifecycle_email_route\(\s*v_event\.tenant_id,\s*'prospect_activated',\s*v_source_agent_id/.test(mig) &&
  /sourced_by_agent_id/.test(mig) &&
  !/IN \('admin', 'executive'\)/.test(mig.replace(/current_user_role\(\) IN \('admin', 'executive'\)/g, "")) &&
  /PERFORM public\.record_prospect_email_delivery\(\s*v_event\.event_id,\s*v_event\.tenant_id,\s*NULL/.test(mig)
) {
  pass("static.sql.enqueue", "created=tenant operations; activated=sourcing Agent route; no HQ fan-out");
} else fail("static.sql.enqueue", "enqueue resolution algorithm missing");

if (
  /v_canonical := lower\(btrim\(COALESCE\(v_row\.recipient_email, ''\)\)\)/.test(mig) &&
  /v_role := 'operations'/.test(mig) &&
  !/v_canonical IS DISTINCT FROM lower\(btrim\(COALESCE\(v_row\.recipient_email/.test(mig) &&
  !/prospect_email_is_production_dispatchable\(v_profile\.email\)/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.claim_notification_email_stage3e_delivery\(uuid\) TO service_role/.test(mig)
) {
  pass("static.sql.claim_dest", "3E claim uses queued destination, not profile email");
} else fail("static.sql.claim_dest", "3E claim still bound to profile email");

if (
  /handleStage3eLifecycle/.test(fn) &&
  /ignore_caller_payload/.test(fn) &&
  /to: intended/.test(fn) &&
  /production_freeze_batch_forbidden/.test(fn) &&
  /isProductionDispatchableEmail\(intended\)/.test(fn) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(fn) &&
  !/vishu\.sen80@gmail\.com/.test(fn) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(policy) &&
  !/vishu\.sen80@gmail\.com/.test(policy)
) {
  pass("static.dispatcher.no_hardcode", "dispatcher ignores caller To; addresses not in JS source");
} else fail("static.dispatcher.no_hardcode", "dispatcher hard-codes destinations or lost caller ignore");

if (
  STAGE3E_FORENSIC_DELIVERY_IDS.includes("b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64") &&
  stage3eDeniedDelivery("b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("c02c0d63-9a0f-4ec6-8966-6035258364ad").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("424796d2-3e78-438c-8fb6-ab5c3bb3e28b").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("63561826-8bb3-4004-b857-b58c397b2aae").reason === "rejected_forensic" &&
  stage3eDeniedDelivery(STAGE2_CERT_DELIVERY_ID).reason === "rejected_stage2_cert"
) {
  pass("unit.forensic", "Stage 3E activation row and older forensic IDs remain denied");
} else fail("unit.forensic", "forensic deny list incomplete");

if (
  isStage3eRecipientRole("prospect_created", "operations") &&
  isStage3eRecipientRole("prospect_created", "executive") &&
  isStage3eRecipientRole("prospect_activated", "agent") &&
  !isStage3eRecipientRole("prospect_created", "lab") &&
  !isStage3eRecipientRole("prospect_created", "agent") &&
  !isStage3eRecipientRole("prospect_activated", "executive") &&
  !isStage3eRecipientRole("prospect_activated", "customer")
) {
  pass("unit.roles", "created=operations; activated=sourcing agent; lab/customer impossible");
} else fail("unit.roles", "role gate failed");

if (
  isProductionDispatchableEmail("primecarediagnosticsuppliesadm@gmail.com") &&
  isProductionDispatchableEmail("vishu.sen80@gmail.com") &&
  !isProductionDispatchableEmail("admin@primecare.local") &&
  !isProductionDispatchableEmail("agent@foo.local") &&
  !isProductionDispatchableEmail("x@local") &&
  !isProductionDispatchableEmail("")
) {
  pass("unit.address_policy", "Gmail allowed; .local rejected");
} else fail("unit.address_policy", "address policy failed");

if (
  /r\.agent_id = v_agent/.test(mig) &&
  /no sourcing Agent notification route/.test(mig) &&
  /Never falls back to profile email, Founder, or another Agent/.test(mig)
) {
  pass("unit.agent_b", "Agent B cannot inherit Vishwa route; missing route fail-closed");
} else fail("unit.agent_b", "Agent isolation / missing-route contract missing");

if (
  isStage3eRequest({ mode: STAGE3E_MODE }) &&
  !isStage3eRequest({ mode: STAGE2_CERT_MODE }) &&
  isProductionBatchClaimForbidden({ appEnv: "prod", qaMode: "false" })
) {
  pass("unit.exact_row", "Stage 3E exact-row mode preserved; Production batch forbidden");
} else fail("unit.exact_row", "3E exact-row safety missing");

const freeze = resolveQaRecipient({
  intendedEmail: "founder@gmail.com",
  qaMode: "false",
  appEnv: "prod",
  testRecipient: "sink@example.com",
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.freeze", "production_freeze remains");
} else fail("unit.freeze", JSON.stringify(freeze));

const disabled = evaluateStage3eEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  stage3eMode: true,
});
if (!shouldClaimRows("false") && disabled.reason === "email_disabled") {
  pass("unit.email_disabled", "EMAIL_ENABLED=false blocks send");
} else fail("unit.email_disabled", JSON.stringify(disabled));

if (CLAIM_BATCH_SIZE === 10 && /p_limit: CLAIM_BATCH_SIZE/.test(fn)) {
  pass("unit.batch", "normal claim batch remains 10 and unused in Production");
} else fail("unit.batch", "batch contract changed");

if (
  /notification_events_assign_event_id/.test(identity) &&
  /prospect_email_is_production_dispatchable/.test(pn3d) &&
  /claim_notification_email_stage3e_delivery/.test(pn3e) &&
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(pn3e) &&
  /email_placeholder/.test(prefs) &&
  !/CREATE TABLE IF NOT EXISTS public\.notification_preferences/.test(mig)
) {
  pass("static.prior_preserved", "3B-R/3D/3E preserved; undeployed preferences not promoted");
} else fail("static.prior_preserved", "prior stage or preferences contract missing");

if (/My Business/.test(ae1a) && /verify:ae-1a/.test(pkg) && !/AE-1B/.test(mig) && !/VE-4/.test(mig)) {
  pass("static.ae1a", "AE-1A preserved; no AE-1B/C/VE-4");
} else fail("static.ae1a", "scope drift");

if (!/zipuzmfkwwucbchlphcj/.test(mig) && !/EMAIL_QA_MODE=true/.test(mig) && !/EMAIL_QA_MODE=true/.test(fn)) {
  pass("static.qa", "QA project not targeted; QA mode not enabled");
} else fail("static.qa", "QA referenced");

if (/verify:prospect-email-stage3f/.test(pkg)) {
  pass("static.pkg", "Stage 3F verifier script registered");
} else fail("static.pkg", "package.json missing 3F verifier");

const frRel = "supabase/migrations/20260928250000_pn_email_stage3fr_lab_name_eligibility.sql";
const frTwinRel = "supabase/sql/pn_email_stage3fr_lab_name_eligibility.sql";
const fr = readRel(frRel);
const frTwin = readRel(frTwinRel);
if (fr && fr === frTwin) pass("static.fr.twin", "Stage 3F-R eligibility migration matches twin");
else fail("static.fr.twin", "Stage 3F-R migration / twin mismatch");

if (
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(fr) &&
  /PN EMAIL STAGE3F REAL RECIPIENT CERT%/.test(fr) &&
  /PN EMAIL STAGE3E REAL RECIPIENT CERT%/.test(pn3e) &&
  !/DELETE FROM/.test(fr) &&
  !/EMAIL_ENABLED\s*=\s*true/.test(fr) &&
  !/cron\.schedule/.test(fr)
) {
  pass("static.fr.sql", "3F prefix added; 3E prefix retained; no send/cron");
} else fail("static.fr.sql", "3F-R eligibility SQL incomplete");

if (
  isStage3eLabNameEligible("PN EMAIL STAGE3F REAL RECIPIENT CERT — DO NOT CONTACT") &&
  isStage3eLabNameEligible("PN EMAIL STAGE3E REAL RECIPIENT CERT — DO NOT CONTACT") &&
  STAGE3F_LAB_NAME_PREFIX === "PN EMAIL STAGE3F REAL RECIPIENT CERT" &&
  !isStage3eLabNameEligible("LAB-P-3CD3204FEFC8") &&
  !isStage3eLabNameEligible("Some customer lab") &&
  !isStage3eLabNameEligible("PN EMAIL STAGE3F ROUTING PROOF — DELETE")
) {
  pass("unit.fr.prefix", "Stage 3F and 3E prefixes accepted; arbitrary labs rejected");
} else fail("unit.fr.prefix", "lab-name eligibility too wide or missing 3F");

if (
  stage3eDeniedDelivery("c02c0d63-9a0f-4ec6-8966-6035258364ad").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("424796d2-3e78-438c-8fb6-ab5c3bb3e28b").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("63561826-8bb3-4004-b857-b58c397b2aae").reason === "rejected_forensic" &&
  stage3eDeniedDelivery("b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64").reason === "rejected_forensic" &&
  stage3eDeniedDelivery(STAGE2_CERT_DELIVERY_ID).reason === "rejected_stage2_cert"
) {
  pass("unit.fr.deny", "forensic IDs and Stage 2 cert remain rejected");
} else fail("unit.fr.deny", "deny list broken");

if (/already_sent/.test(mig) && /outcome === "already_sent"/.test(fn)) {
  pass("unit.fr.sent_rows", "sent rows remain non-resendable");
} else fail("unit.fr.sent_rows", "already_sent protection missing");

if (/ignore_caller_payload/.test(fn) && /to: intended/.test(fn) && !/body\?\.to/.test(fn.split("sendResend")[1] || "")) {
  pass("unit.fr.caller", "caller To/subject/html cannot override provider recipient");
} else fail("unit.fr.caller", "caller override path present");

console.log(failures ? `\nSTAGE 3F: BLOCKED (${failures})\n` : "\nSTAGE 3F: PASS\n");
process.exit(failures ? 1 : 0);
