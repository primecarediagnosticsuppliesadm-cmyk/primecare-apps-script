#!/usr/bin/env node
/**
 * PN-EMAIL Stage 2A — single-send Production certification safety.
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

console.log("\n=== PN-EMAIL STAGE 2A SINGLE-SEND SAFETY ===\n");

const migRel = "supabase/migrations/20260928120000_pn_email_stage2a_certification.sql";
const twinRel = "supabase/sql/pn_email_stage2a_certification.sql";
const fnRel = "supabase/functions/dispatch-notification-email/index.ts";
const policyRel = "supabase/functions/dispatch-notification-email/policy.js";
const mig = readRel(migRel);
const twin = readRel(twinRel);
const fn = readRel(fnRel);
const policy = readRel(policyRel);
const envEx = readRel(".env.functions.example");
const ae1a = readRel("src/pages/MyBusinessPage.jsx");
const pkg = readRel("package.json");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (
  /ADD COLUMN IF NOT EXISTS certification_kind/.test(mig) &&
  /certification_kind = 'pn_email_stage2'/.test(mig) &&
  /d\.certification_kind IS NULL/.test(mig) &&
  /claim_notification_email_certification_delivery/.test(mig) &&
  /create_pn_email_stage2_certification_delivery/.test(mig) &&
  /WHERE d\.delivery_id = p_delivery_id/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.claim_notification_email_certification_delivery\(uuid\) FROM authenticated/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.create_pn_email_stage2_certification_delivery\(text\) FROM authenticated/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.claim_notification_email_certification_delivery\(uuid\) TO service_role/.test(mig) &&
  !/DROP TABLE/.test(mig) &&
  !/DELETE FROM public\.notification_delivery_log/.test(mig)
) {
  pass("static.sql.safety", "additive marker, exact-ID claim, grants locked, no recipient rewrite");
} else fail("static.sql.safety", "SQL contract incomplete");

if (/LIMIT v_limit/.test(mig) && /v_limit := LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 10\)/.test(mig)) {
  pass("static.sql.batch_unchanged", "normal claim still capped at 10 and excludes cert rows");
} else fail("static.sql.batch_unchanged", "normal claim contract changed unsafely");

if (
  /EMAIL_PROD_TEST_RECIPIENT/.test(fn) &&
  /handleProductionCertification/.test(fn) &&
  /isCertificationRequest/.test(fn) &&
  /claim_notification_email_certification_delivery/.test(fn) &&
  /create_pn_email_stage2_certification_delivery/.test(fn) &&
  /ignore_caller_payload/.test(fn) &&
  /disabled_no_claim/.test(fn) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(fn) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(policy) &&
  !/primecarediagnosticsuppliesadm@gmail\.com/.test(mig)
) {
  pass("static.fn.no_hardcode", "test Gmail is not in source; secret name only");
} else fail("static.fn.no_hardcode", "hardcoded recipient or missing cert path");

if (
  /if \(isCertificationRequest/.test(fn) &&
  /return await handleProductionCertification/.test(fn) &&
  /claim_notification_email_deliveries/.test(fn)
) {
  pass("static.fn.no_batch_in_cert", "cert branch returns before normal batch claim");
} else fail("static.fn.no_batch_in_cert", "cert path may still batch-claim");

if (/EMAIL_PROD_TEST_RECIPIENT=/.test(envEx) && !/VITE_EMAIL_PROD_TEST/.test(envEx)) {
  pass("static.env_example", "EMAIL_PROD_TEST_RECIPIENT named, not VITE_");
} else fail("static.env_example", "env example missing Production cert recipient name");

if (/verify:prospect-email-stage2a/.test(pkg) && /verify:ae-1a/.test(pkg)) {
  pass("static.scripts", "stage2a and ae-1a verify scripts remain");
} else fail("static.scripts", "package.json scripts missing");

if (/MyBusinessPage/.test(ae1a) && /As of today/.test(ae1a)) {
  pass("static.ae1a.untouched_marker", "AE-1A page still present on this candidate");
} else fail("static.ae1a.untouched_marker", "AE-1A page missing");

const APPROVED = "founder.test@example.com";
const CUSTOMER = "lab.owner@customer.example";

const freeze = resolveQaRecipient({
  intendedEmail: CUSTOMER,
  qaMode: "false",
  appEnv: "prod",
  testRecipient: APPROVED,
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.1.prod_normal_freeze", "prod + normal delivery = production_freeze");
} else fail("unit.1.prod_normal_freeze", JSON.stringify(freeze));

const envReady = evaluateProductionCertificationEnv({
  emailEnabled: "true",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: APPROVED,
});
if (!envReady.ok) fail("unit.env_ready", JSON.stringify(envReady));
else pass("unit.env_ready", "prod cert env eligible when enabled");

const normalRow = evaluateProductionCertificationRow({
  certificationKind: null,
  intendedEmail: APPROVED,
  approvedRecipient: APPROVED,
  deliveryId: "11111111-1111-1111-1111-111111111111",
});
if (!normalRow.ok && normalRow.reason === "not_certification_row") {
  pass("unit.2.normal_row_reject", "cert mode + normal row = reject");
} else fail("unit.2.normal_row_reject", JSON.stringify(normalRow));

const wrongRcpt = evaluateProductionCertificationRow({
  certificationKind: STAGE2_CERT_KIND,
  intendedEmail: CUSTOMER,
  approvedRecipient: APPROVED,
  deliveryId: "11111111-1111-1111-1111-111111111111",
});
if (!wrongRcpt.ok && wrongRcpt.reason === "recipient_mismatch") {
  pass("unit.3.wrong_recipient", "cert row + wrong recipient = reject");
} else fail("unit.3.wrong_recipient", JSON.stringify(wrongRcpt));

const missingSecret = evaluateProductionCertificationEnv({
  emailEnabled: "true",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: "",
});
if (!missingSecret.ok && missingSecret.reason === "missing_prod_test_recipient") {
  pass("unit.4.missing_secret", "missing EMAIL_PROD_TEST_RECIPIENT = reject");
} else fail("unit.4.missing_secret", JSON.stringify(missingSecret));

const eligible = evaluateProductionCertificationRow({
  certificationKind: STAGE2_CERT_KIND,
  intendedEmail: APPROVED,
  approvedRecipient: APPROVED,
  deliveryId: "11111111-1111-1111-1111-111111111111",
});
if (eligible.ok && eligible.reason === "certification_eligible" && eligible.providerTo === APPROVED) {
  pass("unit.5.exact_recipient", "cert row + exact approved recipient = eligible");
} else fail("unit.5.exact_recipient", JSON.stringify(eligible));

if (CLAIM_BATCH_SIZE === 10) pass("unit.6.batch_size", "normal claim batch remains 10");
else fail("unit.6.batch_size", String(CLAIM_BATCH_SIZE));

if (
  /WHERE d\.delivery_id = p_delivery_id/.test(mig) &&
  !/LIMIT v_limit/.test(mig.split("claim_notification_email_certification_delivery")[1] || "")
) {
  pass("unit.6.cert_claim_one", "certification claim has no batch LIMIT");
} else fail("unit.6.cert_claim_one", "cert claim may still batch");

if (
  /certification_kind IS DISTINCT FROM 'pn_email_stage2'/.test(mig) &&
  /RETURN;/.test(mig.split("claim_notification_email_certification_delivery")[1] || "")
) {
  pass("unit.7.foreign_id", "non-cert ID returns no claimed row");
} else fail("unit.7.foreign_id", "foreign ID handling missing");

if (/already_sent/.test(mig) && /skipped: "already_sent"/.test(fn)) {
  pass("unit.8.no_resend", "sent certification row is not resent");
} else fail("unit.8.no_resend", "already-sent path missing");

if (
  /ignore_caller_payload/.test(fn) &&
  /Caller to\/subject\/html\/delivery_id never select/.test(fn) &&
  /p_recipient_email: approved/.test(fn)
) {
  pass("unit.9.ignore_caller", "caller to/subject/html/delivery_id ignored for cert send");
} else fail("unit.9.ignore_caller", "caller payload may still steer cert send");

const disabled = evaluateProductionCertificationEnv({
  emailEnabled: "false",
  appEnv: "prod",
  qaMode: "false",
  certificationMode: true,
  prodTestRecipient: APPROVED,
});
if (
  !shouldClaimRows("false") &&
  !disabled.ok &&
  disabled.reason === "email_disabled" &&
  /disabled_no_claim/.test(fn)
) {
  pass("unit.10.email_disabled", "EMAIL_ENABLED=false blocks all provider sends including cert");
} else fail("unit.10.email_disabled", JSON.stringify(disabled));

if (
  /claim_notification_email_deliveries/.test(fn) &&
  /p_limit: CLAIM_BATCH_SIZE/.test(fn) &&
  /isCertificationRequest/.test(fn)
) {
  pass("unit.11.batch_still_present", "normal batch claim remains, unused while disabled/non-cert");
} else fail("unit.11.batch_still_present", "normal batch path missing");

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
  !qaCert.ok &&
  (qaCert.reason === "certification_prod_only" || qaCert.reason === "certification_qa_mode_forbidden")
) {
  pass("unit.12.qa_unchanged", "QA rewrite remains; cert path refuses QA env");
} else fail("unit.12.qa_unchanged", JSON.stringify({ qa, qaCert }));

if (!isCertificationRequest({ mode: "dispatch" }) && isCertificationRequest({ mode: STAGE2_CERT_MODE })) {
  pass("unit.mode_gate", "only explicit certification mode is recognized");
} else fail("unit.mode_gate", "mode gate failed");

const rendered = renderCertificationEmail({ appPublicUrl: "https://app.primecarediagnostics.in" });
if (
  rendered.ok &&
  rendered.subject === STAGE2_CERT_SUBJECT &&
  rendered.text.includes(STAGE2_CERT_BODY) &&
  !/Prospect/.test(rendered.text) &&
  !/lab_name/.test(rendered.text) &&
  rendered.html.includes("https://app.primecarediagnostics.in")
) {
  pass("unit.synthetic_content", "synthetic subject/body; no customer/lab names");
} else fail("unit.synthetic_content", rendered.subject || "render failed");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))\n`);
  process.exit(1);
}
console.log("\nOverall: GO — PN-EMAIL Stage 2A single-send safety (static)\n");
