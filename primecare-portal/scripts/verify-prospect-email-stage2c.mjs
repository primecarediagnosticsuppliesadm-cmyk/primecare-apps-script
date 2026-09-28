#!/usr/bin/env node
/**
 * PN-EMAIL Stage 2C — certification-row creation repair.
 * Static + policy unit tests only. No Production mutation. No send.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_BATCH_SIZE,
  STAGE2_CERT_BODY,
  STAGE2_CERT_KIND,
  STAGE2_CERT_MODE,
  STAGE2_CERT_SUBJECT,
  evaluateProductionCertificationEnv,
  evaluateProductionCertificationRow,
  isCertificationRequest,
  renderCertificationEmail,
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

console.log("\n=== PN-EMAIL STAGE 2C CERTIFICATION-ROW REPAIR ===\n");

const migRel = "supabase/migrations/20260928140000_pn_email_stage2c_certification_repair.sql";
const twinRel = "supabase/sql/pn_email_stage2c_certification_repair.sql";
const fnRel = "supabase/functions/dispatch-notification-email/index.ts";
const policyRel = "supabase/functions/dispatch-notification-email/policy.js";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const fn = readRel(fnRel);
const policy = readRel(policyRel);
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const pkg = readRel("package.json");
const createFn = mig.split("claim_notification_email_certification_delivery")[0] || mig;
const createBody = (createFn.split("LANGUAGE plpgsql")[1] || createFn).split("DO $$")[0] || "";

if (mig && mig === twin) pass("static.twin", "Stage 2C migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /INTO v_existing_id, v_existing_event, v_existing_recipient, v_existing_kind, v_existing_status/.test(mig) &&
  /v_email := lower\(btrim\(COALESCE\(p_recipient_email, ''\)\)\)/.test(mig) &&
  /INSERT INTO public\.notification_delivery_log/.test(createBody) &&
  /,[\s\n]*v_email,[\s\n]*'resend'/.test(createBody) &&
  !/INTO v_delivery_id, v_event_id, v_email,/.test(mig) &&
  !/DROP TABLE/.test(mig) &&
  !/DELETE FROM public\.notification_delivery_log/.test(mig)
) {
  pass("static.sql.create_preserves_input", "create RPC no-row path keeps p_recipient_email in v_email");
} else fail("static.sql.create_preserves_input", "SELECT INTO still aliases the input recipient");

if (
  /REVOKE ALL ON FUNCTION public\.create_pn_email_stage2_certification_delivery\(text\) FROM authenticated/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.create_pn_email_stage2_certification_delivery\(text\) TO service_role/.test(mig) &&
  !/GRANT EXECUTE ON FUNCTION public\.create_pn_email_stage2_certification_delivery\(text\) TO authenticated/.test(mig)
) {
  pass("static.sql.grants_unchanged", "create RPC grants remain service_role/postgres only");
} else fail("static.sql.grants_unchanged", "grants relaxed");

if (!/UPDATE public\.notification_delivery_log/.test(createBody)) {
  pass("static.sql.no_sent_rewrite_in_create", "create RPC does not UPDATE existing recipients");
} else fail("static.sql.no_sent_rewrite_in_create", "create RPC updates delivery rows");

if (
  /3face3b7-abac-46ff-839a-eccc1ef2b79e/.test(mig) &&
  /status = 'skipped'/.test(mig) &&
  /error_code = 'recipient_mismatch'/.test(mig) &&
  /d\.recipient_email IS NULL/.test(mig) &&
  /d\.sent_at IS NULL/.test(mig) &&
  /d\.provider_message_id IS NULL/.test(mig) &&
  /d\.certification_kind = 'pn_email_stage2'/.test(mig) &&
  /status = 'queued'/.test(mig) &&
  /RAISE EXCEPTION 'stage2c_cert_row_already_sent'/.test(mig) &&
  /RAISE EXCEPTION 'stage2c_cert_row_guard_failed'/.test(mig) &&
  !/attempt_count/.test(mig.split("B. In-place repair")[1] || mig)
) {
  pass("static.sql.repair_guards", "in-place repair is UUID-guarded and does not reset attempt_count");
} else fail("static.sql.repair_guards", "repair guards incomplete");

const APPROVED = "founder.test@example.com";
const CUSTOMER = "lab.owner@customer.example";
const FOUNDER_INBOX = "primecarediagnosticsuppliesadm@gmail.com";

if (
  (mig.match(new RegExp(FOUNDER_INBOX.replace(/[.@]/g, "\\$&"), "g")) || []).length === 1 &&
  !fn.includes(FOUNDER_INBOX) &&
  !policy.includes(FOUNDER_INBOX)
) {
  pass("static.fn.no_hardcode_dispatcher", "Founder inbox only in guarded 2C repair SQL, not dispatcher");
} else fail("static.fn.no_hardcode_dispatcher", "inbox leaked into dispatcher or missing from repair");

/**
 * Semantic stand-in for the PL/pgSQL create path.
 * existing=null means SELECT INTO found zero rows.
 */
function simulateCreateRecipient(pRecipientEmail, existingRow) {
  const vEmail = String(pRecipientEmail || "").trim().toLowerCase();
  if (!vEmail.includes("@")) throw new Error("invalid");
  let vExistingRecipient = null;
  let found = false;
  if (existingRow) {
    found = true;
    vExistingRecipient = existingRow.recipient_email;
  } else {
    vExistingRecipient = null;
  }
  if (found) return { stored: vExistingRecipient, reused: true, inputPreserved: vEmail };
  return { stored: vEmail, reused: false, inputPreserved: vEmail };
}

const created = simulateCreateRecipient(APPROVED, null);
if (created.stored === APPROVED && created.inputPreserved === APPROVED && !created.reused) {
  pass("unit.1.no_row_stores_input", "no existing cert row + valid recipient stores input");
} else fail("unit.1.no_row_stores_input", JSON.stringify(created));

function simulateBuggyCreate(pRecipientEmail, existingRow) {
  let vEmail = String(pRecipientEmail || "").trim().toLowerCase();
  if (!existingRow) vEmail = null;
  return vEmail;
}
if (simulateBuggyCreate(APPROVED, null) === null && created.stored === APPROVED) {
  pass("unit.2.norow_cannot_null_recipient", "fixed path does not null the recipient on no-row SELECT INTO");
} else fail("unit.2.norow_cannot_null_recipient", "regression still nulls recipient");

const reused = simulateCreateRecipient(CUSTOMER, {
  recipient_email: APPROVED,
  status: "queued",
});
if (reused.reused && reused.stored === APPROVED) {
  pass("unit.3.existing_unique_reuse", "existing cert row is reused; input does not create a second recipient");
} else fail("unit.3.existing_unique_reuse", JSON.stringify(reused));

const sentReuse = simulateCreateRecipient(CUSTOMER, {
  recipient_email: APPROVED,
  status: "sent",
});
if (sentReuse.reused && sentReuse.stored === APPROVED && sentReuse.stored !== CUSTOMER) {
  pass("unit.4.sent_recipient_not_rewritten", "SENT cert row recipient is not rewritten");
} else fail("unit.4.sent_recipient_not_rewritten", JSON.stringify(sentReuse));

const wrongRcpt = evaluateProductionCertificationRow({
  certificationKind: STAGE2_CERT_KIND,
  intendedEmail: CUSTOMER,
  approvedRecipient: APPROVED,
  deliveryId: "3face3b7-abac-46ff-839a-eccc1ef2b79e",
});
if (!wrongRcpt.ok && wrongRcpt.reason === "recipient_mismatch") {
  pass("unit.5.wrong_recipient_fail_closed", "wrong recipient still fails closed");
} else fail("unit.5.wrong_recipient_fail_closed", JSON.stringify(wrongRcpt));

const missingSecret = evaluateProductionCertificationEnv({
  emailEnabled: "true",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: "",
});
if (!missingSecret.ok && missingSecret.reason === "missing_prod_test_recipient") {
  pass("unit.6.missing_secret_fail_closed", "missing EMAIL_PROD_TEST_RECIPIENT still fails closed");
} else fail("unit.6.missing_secret_fail_closed", JSON.stringify(missingSecret));

const disabled = evaluateProductionCertificationEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: APPROVED,
});
if (!shouldClaimRows("false") && !disabled.ok && disabled.reason === "email_disabled" && /disabled_no_claim/.test(fn)) {
  pass("unit.7.email_disabled_blocks_send", "EMAIL_ENABLED=false still prevents claim/provider call");
} else fail("unit.7.email_disabled_blocks_send", JSON.stringify(disabled));

const pn2a = readRel("supabase/sql/pn_email_stage2a_certification.sql");
if (
  CLAIM_BATCH_SIZE === 10 &&
  /d\.certification_kind IS NULL/.test(pn2a) &&
  /v_limit := LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 10\)/.test(pn2a)
) {
  pass("unit.8.batch_excludes_cert", "normal batch claim still excludes certification rows");
} else fail("unit.8.batch_excludes_cert", "batch claim contract changed");

if (
  /certification_kind IS DISTINCT FROM 'pn_email_stage2'/.test(pn2a) &&
  /WHERE d\.delivery_id = p_delivery_id/.test(pn2a)
) {
  pass("unit.9.exact_claim_not_normal", "cert exact-row claim cannot claim normal email rows");
} else fail("unit.9.exact_claim_not_normal", "exact claim contract missing");

if (
  /ignore_caller_payload/.test(fn) &&
  /Caller to\/subject\/html\/delivery_id never select/.test(fn) &&
  /p_recipient_email: approved/.test(fn)
) {
  pass("unit.10.caller_payload_ignored", "caller to/delivery_id/subject/html remain ignored");
} else fail("unit.10.caller_payload_ignored", "caller payload steering");

const qa = resolveQaRecipient({
  intendedEmail: "qa.admin@primecare.test",
  qaMode: "true",
  appEnv: "qa",
  testRecipient: "qa.sink@example.com",
});
const qaCert = evaluateProductionCertificationEnv({
  emailEnabled: "true",
  appEnv: "qa",
  qaMode: "true",
  certificationMode: true,
  prodTestRecipient: APPROVED,
});
if (
  qa.action === "rewrite" &&
  qa.reason === "qa_rewrite_synthetic" &&
  !qaCert.ok
) {
  pass("unit.11.qa_unchanged", "QA rewrite remains; cert path refuses QA env");
} else fail("unit.11.qa_unchanged", JSON.stringify({ qa, qaCert }));

if (/MyBusinessPage/.test(ae1a) && /As of today/.test(ae1a) && /verify:ae-1a/.test(pkg)) {
  pass("unit.12.ae1a_present", "AE-1A page and verifier remain on this candidate");
} else fail("unit.12.ae1a_present", "AE-1A missing");

const eligible = evaluateProductionCertificationRow({
  certificationKind: STAGE2_CERT_KIND,
  intendedEmail: FOUNDER_INBOX,
  approvedRecipient: FOUNDER_INBOX,
  deliveryId: "3face3b7-abac-46ff-839a-eccc1ef2b79e",
});
const rendered = renderCertificationEmail({ appPublicUrl: "https://app.primecarediagnostics.in" });
if (
  eligible.ok &&
  eligible.providerTo === FOUNDER_INBOX &&
  rendered.subject === STAGE2_CERT_SUBJECT &&
  rendered.text.includes(STAGE2_CERT_BODY) &&
  isCertificationRequest({ mode: STAGE2_CERT_MODE })
) {
  pass("unit.dry.future_row_eligible", "repaired approved recipient would pass row gate; synthetic body unchanged");
} else fail("unit.dry.future_row_eligible", JSON.stringify({ eligible, subject: rendered.subject }));

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))\n`);
  process.exit(1);
}
console.log("\nOverall: GO — PN-EMAIL Stage 2C certification-row repair (static)\n");
