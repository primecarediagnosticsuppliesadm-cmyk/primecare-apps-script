#!/usr/bin/env node
/**
 * PN-EMAIL Stage 3D — Production recipient safety.
 * Static + policy unit tests only. No Production mutation. No send.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_BATCH_SIZE,
  evaluateProductionCertificationEnv,
  isProductionDispatchableEmail,
  NON_DISPATCHABLE_DOMAIN,
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

console.log("\n=== PN-EMAIL STAGE 3D RECIPIENT SAFETY ===\n");

const migRel = "supabase/migrations/20260928220000_pn_email_stage3d_recipient_safety.sql";
const twinRel = "supabase/sql/pn_email_stage3d_recipient_safety.sql";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const fn = readRel("supabase/functions/dispatch-notification-email/index.ts");
const policy = readRel("supabase/functions/dispatch-notification-email/policy.js");
const identity = readRel("supabase/migrations/20260928210000_pn_email_stage3br_event_identity.sql");
const pn2c = readRel("supabase/migrations/20260928140000_pn_email_stage2c_certification_repair.sql");
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const insertSrc = readRel("src/notifications/notificationEventInsert.js");
const pkg = readRel("package.json");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /CREATE OR REPLACE FUNCTION public\.prospect_email_is_production_dispatchable\(/.test(mig) &&
  /NOT LIKE '%\.local'/.test(mig) &&
  /IS DISTINCT FROM 'local'/.test(mig) &&
  /non_dispatchable_domain/.test(mig) &&
  /prospect_email_is_production_dispatchable\(d\.recipient_email\)/.test(mig) &&
  /d\.certification_kind IS NULL/.test(mig) &&
  /LIMIT v_limit/.test(mig) &&
  /v_limit := LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 10\)/.test(mig) &&
  /lower\(btrim\(COALESCE\(p\.role, ''\)\)\) IN \('admin', 'executive'\)/.test(mig) &&
  /sourced_by_agent_id/.test(mig) &&
  !/AGT_VISHWAK/.test(mig) &&
  !/PROD_AGENT_001/.test(mig) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(mig) &&
  !/DELETE FROM/.test(mig) &&
  !/EMAIL_ENABLED\s*=\s*true/.test(mig) &&
  !/cron\.schedule/.test(mig)
) {
  pass("static.sql.policy", "address rule + enqueue skip + claim excludes .local; no identity hard-codes");
} else fail("static.sql.policy", "SQL recipient-safety contract incomplete");

if (
  /isProductionDispatchableEmail/.test(fn) &&
  /NON_DISPATCHABLE_DOMAIN/.test(fn) &&
  /sendResend\(/.test(fn) &&
  fn.indexOf("isProductionDispatchableEmail(intended)") < fn.lastIndexOf("sendResend(") &&
  /production_freeze/.test(policy) &&
  /EMAIL_ENABLED=false/.test(fn)
) {
  pass("static.dispatcher.defense", ".local blocked before Resend; freeze and EMAIL_ENABLED remain");
} else fail("static.dispatcher.defense", "dispatcher .local defense missing or after send");

const eligible = [
  "  Founder.Name@Gmail.com  ",
  "vishwak@primecarediagnostics.in",
  "ops@example.com",
];
const excluded = [
  null,
  "",
  "   ",
  "not-an-email",
  "admin@primecare.local",
  "ADMIN@PRIMECARE.LOCAL",
  "agent@foo.local",
  "x@local",
];
if (eligible.every((e) => isProductionDispatchableEmail(e))) {
  pass("unit.A.eligible", "Gmail and company domains remain eligible");
} else fail("unit.A.eligible", "false-negative on legitimate addresses");

if (excluded.every((e) => !isProductionDispatchableEmail(e))) {
  pass("unit.A.excluded", "NULL/blank/invalid/.local/primecare.local excluded");
} else fail("unit.A.excluded", "false-positive on non-dispatchable address");

if (
  /'queued'/.test(mig) &&
  /CASE WHEN rec\.dispatchable THEN 'queued' ELSE 'skipped' END/.test(mig) &&
  /inactive_profile/.test(mig) &&
  /non_dispatchable_domain/.test(mig)
) {
  pass("unit.AB.enqueue_matrix", "created queues only dispatchable HQ; activated skips inactive/.local");
} else fail("unit.AB.enqueue_matrix", "enqueue eligibility matrix missing");

if (
  /IN \('admin', 'executive'\)/.test(mig) &&
  /lower\(btrim\(COALESCE\(p\.role, ''\)\)\) = 'agent'/.test(mig) &&
  !/role.*=.*'lab'/.test(mig)
) {
  pass("unit.AB.no_lab", "lab/customer roles are not lifecycle email recipients");
} else fail("unit.AB.no_lab", "lab role may be included");

if (NON_DISPATCHABLE_DOMAIN === "non_dispatchable_domain") {
  pass("unit.C.error_code", "permanent non_dispatchable_domain classification");
} else fail("unit.C.error_code", "error code mismatch");

const freeze = resolveQaRecipient({
  intendedEmail: "founder@gmail.com",
  qaMode: "false",
  appEnv: "prod",
  testRecipient: "sink@example.com",
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.D.freeze", "production_freeze still suppresses normal Production send");
} else fail("unit.D.freeze", JSON.stringify(freeze));

const disabled = evaluateProductionCertificationEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: "primecarediagnosticsuppliesadm@gmail.com",
});
if (!shouldClaimRows("false") && !disabled.ok && disabled.reason === "email_disabled") {
  pass("unit.D.email_disabled", "EMAIL_ENABLED=false still blocks claim/send");
} else fail("unit.D.email_disabled", JSON.stringify(disabled));

if (CLAIM_BATCH_SIZE === 10 && /p_limit: CLAIM_BATCH_SIZE/.test(fn)) {
  pass("unit.D.batch", "normal claim batch remains 10");
} else fail("unit.D.batch", "batch contract changed");

if (
  /notification_events_assign_event_id/.test(identity) &&
  /3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(pn2c) &&
  !/3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(mig) &&
  !/c02c0d63-9a0f-4ec6-8966-6035258364ad/.test(mig) &&
  !/424796d2-3e78-438c-8fb6-ab5c3bb3e28b/.test(mig) &&
  !/63561826-8bb3-4004-b857-b58c397b2aae/.test(mig)
) {
  pass("static.forensic_untouched", "identity fix kept; forensic delivery IDs not rewritten");
} else fail("static.forensic_untouched", "forensic or Stage 2 identity may be targeted");

if (/SERVER_AUTHORITATIVE_NOTIFICATION_EVENT_TYPES/.test(insertSrc)) {
  pass("static.caller_cannot_forge", "client still cannot construct prospect_* events");
} else fail("static.caller_cannot_forge", "client forge protection missing");

if (/My Business/.test(ae1a) && /verify:ae-1a/.test(pkg) && !/AE-1B/.test(mig) && !/VE-4/.test(mig)) {
  pass("static.ae1a", "AE-1A preserved; no AE-1B/C/VE-4");
} else fail("static.ae1a", "scope drift");

if (!/zipuzmfkwwucbchlphcj/.test(mig) && !/EMAIL_QA_MODE=true/.test(mig)) {
  pass("static.qa", "QA project not targeted");
} else fail("static.qa", "QA referenced");

console.log(failures ? `\nSTAGE 3D: BLOCKED (${failures})\n` : "\nSTAGE 3D: PASS\n");
process.exit(failures ? 1 : 0);
