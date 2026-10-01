#!/usr/bin/env node
/**
 * PN-EMAIL production dispatch preparation.
 * Static and policy tests only. No Production mutation. No send.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyProviderError,
  crashWindowOutcome,
  isForensicProductionDelivery,
  isProductionExactRequest,
  isProductionQaModeForbidden,
  mayClaimProduction,
  providerCallAllowed,
  stripHeaderBreaks,
  renderForEventType,
} from "../supabase/functions/dispatch-notification-email/policy.js";
import {
  applyProviderTelemetry,
  verifySvixSignature,
} from "../supabase/functions/resend-notification-webhook/verify.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

const fn = readRel("supabase/functions/dispatch-notification-email/index.ts");
const mig = readRel("supabase/migrations/20261001010000_pn_email_production_dispatch.sql");
const hook = readRel("supabase/functions/resend-notification-webhook/index.ts");
const routing = readRel("supabase/migrations/20260928240000_pn_email_stage3f_notification_routing.sql");
const p0 = readRel("supabase/migrations/20260930120000_p0_public_privilege_hardening.sql");
const config = readRel("supabase/config.toml");

const storedStart = fn.indexOf("async function sendStoredProductionDelivery");
const storedEnd = fn.indexOf("async function handleProductionExact");
const stored = storedStart >= 0 && storedEnd > storedStart ? fn.slice(storedStart, storedEnd) : "";
const exactStart = fn.indexOf("async function handleProductionExact");
const exactEnd = fn.indexOf("Deno.serve");
const exact = exactStart >= 0 && exactEnd > exactStart ? fn.slice(exactStart, exactEnd) : "";

const BUSINESS = [
  "ba7e7e3c-7ac2-4df3-a2c4-c057e7c39d66",
  "d93b9ce9-aed6-4a97-8bfb-d192ff62d79c",
  "d40abfa4-e4aa-4792-8fa8-f846ba7c9c17",
  "49c15364-8630-49f9-bf2f-058135dea478",
  "a62d3641-8d19-4cfa-837e-8f53e82c0d17",
  "cfe641ca-4510-442f-9e09-19da8bc55688",
  "7e620c1f-c960-4e92-b437-9bcd23eba1a0",
];
const FORENSIC_GMAIL = "424796d2-3e78-438c-8fb6-ab5c3bb3e28b";

console.log("\n=== PN-EMAIL PRODUCTION DISPATCH ===\n");

if (!mayClaimProduction({ appEnv: "prod", emailEnabled: "false", qaMode: "false", productionDispatch: "true" })) {
  pass("1.disabled", "EMAIL_ENABLED=false does not claim");
} else fail("1.disabled", "disabled flag still claims");

if (!mayClaimProduction({ appEnv: "prod", emailEnabled: "true", qaMode: "false", productionDispatch: "false" })
  && /production_dispatch_disabled/.test(fn)
  && /production_freeze_batch_forbidden/.test(fn)) {
  pass("2.dispatch_flag", "Production dispatch flag false does not claim");
} else fail("2.dispatch_flag", "dispatch flag gate missing");

if (isProductionQaModeForbidden({ appEnv: "prod", qaMode: "true" })
  && /production_qa_mode_forbidden/.test(fn)
  && fn.indexOf("production_qa_mode_forbidden") < fn.indexOf("claim_notification_email_deliveries")) {
  pass("3.qa_mode", "Production QA mode returns before claim");
} else fail("3.qa_mode", "QA mode can still claim");

if (stored && !/resolveQaRecipient/.test(stored) && /to: intended/.test(stored) && /PrimeCare"/.test(stored) && !/PrimeCare QA/.test(stored)) {
  pass("4.stored_recipient", "Production send uses stored recipient and does not call resolveQaRecipient");
} else fail("4.stored_recipient", "stored path missing or still rewrites");

if (isProductionExactRequest({ mode: "production_exact" })
  && /production_exact_requires_cron_secret/.test(fn)
  && /exactMode && !cronOk/.test(fn)) {
  pass("5.exact_auth", "exact mode requires the cron secret");
} else fail("5.exact_auth", "exact auth gate missing");

if (/claim_notification_email_production_delivery/.test(exact)
  && /p_delivery_id: requestedDeliveryId/.test(exact)
  && exact.indexOf('outcome !== "claimed"') < exact.indexOf("sendStoredProductionDelivery")) {
  pass("6.exact_one_row", "exact mode claims only the supplied id and does not send otherwise");
} else fail("6.exact_one_row", "exact claim contract missing");

if (isForensicProductionDelivery(FORENSIC_GMAIL)
  && /forensic_excluded/.test(mig)
  && mig.includes(FORENSIC_GMAIL)
  && /isForensicProductionDelivery\(requestedDeliveryId\)/.test(exact)) {
  pass("7.forensic", "forensic ids are refused before send");
} else fail("7.forensic", "forensic exclusion incomplete");

if (/certification_excluded/.test(mig) && /v_row\.certification_kind IS NOT NULL/.test(mig)) {
  pass("8.certification", "certification rows are not claimed");
} else fail("8.certification", "certification exclusion missing");

if (/already_sent/.test(mig) && /v_row\.status = 'sent'/.test(mig)) {
  pass("9.already_sent", "sent rows are not claimed");
} else fail("9.already_sent", "sent exclusion missing");

if (/provider_id_present/.test(mig) && /provider_message_id/.test(mig)) {
  pass("10.provider_id", "rows with a provider id are not claimed");
} else fail("10.provider_id", "provider id exclusion missing");

const concurrent = classifyProviderError(409, "", "concurrent_idempotent_requests");
const conflict = classifyProviderError(409, "", "invalid_idempotent_request");
const other409 = classifyProviderError(409, "", "");
if (concurrent.retryable && concurrent.errorCode === "provider_idempotency_concurrent"
  && !conflict.retryable
  && !other409.retryable
  && other409.errorCode !== concurrent.errorCode) {
  pass("11.idempotency_409", "only concurrent idempotency collisions are retryable");
} else fail("11.idempotency_409", JSON.stringify({ concurrent, conflict, other409 }));

const uncertain = crashWindowOutcome({
  status: "processing",
  provider_message_id: "",
  attempt_count: 1,
  last_attempt_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
});
if (uncertain === "send_uncertain_do_not_retry"
  && !providerCallAllowed(uncertain, { attempt_count: 1, delivery_id: "x" })
  && /send_uncertain_do_not_retry/.test(mig)
  && /interval '24 hours'/.test(mig)) {
  pass("12.uncertain_24h", "processing older than 24 hours does not call Resend");
} else fail("12.uncertain_24h", uncertain);

const exhausted = crashWindowOutcome({
  status: "processing",
  provider_message_id: "",
  attempt_count: 4,
  last_attempt_at: new Date().toISOString(),
});
if (exhausted === "attempts_exhausted"
  && !providerCallAllowed("claimed", { attempt_count: 5, delivery_id: "11111111-1111-1111-1111-111111111111" })
  && /attempts_exhausted/.test(mig)
  && /COALESCE\(d\.attempt_count, 0\) >= 4/.test(mig)) {
  pass("13.max_attempts", "exhausted attempts do not call Resend");
} else fail("13.max_attempts", exhausted);

const rendered = renderForEventType("prospect_created", {
  payload: { lab_name: "Line\r\nBcc: evil@example.com" },
  appPublicUrl: "https://app.primecarediagnostics.in",
});
if (rendered.ok && !/[\r\n]/.test(rendered.subject) && stripHeaderBreaks("a\nb") === "a b") {
  pass("14.subject_breaks", "CR/LF stripped from subject");
} else fail("14.subject_breaks", rendered.subject);

if (/ignore_caller_payload/.test(fn)
  && !/body\?\.to/.test(stored)
  && !/body\?\.subject/.test(stored)
  && /Idempotency-Key/.test(fn)) {
  pass("15.caller_override", "caller To/subject/html are not the production payload");
} else fail("15.caller_override", "caller content can override production send");

const secret = `whsec_${Buffer.from("phase2-webhook-secret").toString("base64")}`;
const payload = JSON.stringify({ type: "email.delivered", created_at: "2026-10-01T00:00:00.000Z", data: { email_id: "msg_1" } });
const id = "msg_test";
const timestamp = "1760000000";
const good = createHmac("sha256", Buffer.from("phase2-webhook-secret"))
  .update(`${id}.${timestamp}.${payload}`)
  .digest("base64");
const bad = await verifySvixSignature({
  secret,
  payload,
  id,
  timestamp,
  signature: "v1,not-the-signature",
  nowSeconds: 1760000000,
});
const goodResult = await verifySvixSignature({
  secret,
  payload,
  id,
  timestamp,
  signature: `v1,${good}`,
  nowSeconds: 1760000000,
});
const verifyCall = hook.indexOf("await verifySvixSignature");
const clientCall = hook.indexOf("createClient(supabaseUrl");
if (!bad.ok && bad.reason === "bad_signature" && goodResult.ok
  && verifyCall >= 0 && clientCall > verifyCall) {
  pass("16.webhook_signature", "invalid Svix signature is rejected before the database client");
} else fail("16.webhook_signature", JSON.stringify({ bad, goodResult }));

const seen = new Set(["msg_same"]);
const duplicate = applyProviderTelemetry(
  { status: "sent", providerMessageId: "msg_1", deliveredAt: null },
  { svixId: "msg_same", type: "email.delivered", providerMessageId: "msg_1", occurredAt: "t" },
  seen,
);
if (duplicate.result === "duplicate" && /ON CONFLICT \(svix_id\) DO NOTHING/.test(mig) && /RETURN 'duplicate'/.test(mig)) {
  pass("17.webhook_duplicate", "duplicate svix id does not apply again");
} else fail("17.webhook_duplicate", duplicate.result);

const delivered = applyProviderTelemetry(
  { status: "sent", providerMessageId: "msg_1", deliveredAt: null, bouncedAt: null, complainedAt: null },
  { svixId: "s1", type: "email.delivered", providerMessageId: "msg_1", occurredAt: "2026-10-01T00:00:00.000Z" },
  new Set(),
);
if (delivered.row.deliveredAt && /email\.delivered/.test(mig) && /d\.delivered_at IS NULL/.test(mig)) {
  pass("18.delivered", "delivered webhook sets delivered_at");
} else fail("18.delivered", JSON.stringify(delivered));

const bounced = applyProviderTelemetry(
  { status: "sent", providerMessageId: "msg_1", bouncedAt: null },
  { svixId: "s2", type: "email.bounced", providerMessageId: "msg_1", occurredAt: "2026-10-01T00:01:00.000Z" },
  new Set(),
);
if (bounced.row.bouncedAt && /bounced_at/.test(mig)) {
  pass("19.bounced", "bounced webhook sets bounced_at");
} else fail("19.bounced", JSON.stringify(bounced));

const complained = applyProviderTelemetry(
  { status: "sent", providerMessageId: "msg_1", complainedAt: null },
  { svixId: "s3", type: "email.complained", providerMessageId: "msg_1", occurredAt: "2026-10-01T00:02:00.000Z" },
  new Set(),
);
if (complained.row.complainedAt && /complained_at/.test(mig)) {
  pass("20.complained", "complained webhook sets complained_at");
} else fail("20.complained", JSON.stringify(complained));

if (/no sourcing Agent notification route/.test(routing)
  && /Never falls back to profile email, Founder, or another Agent/.test(routing)
  && !/profiles\.email/.test(mig)) {
  pass("21.agent_route", "missing Agent route does not fall back to another identity");
} else fail("21.agent_route", "agent fallback contract missing");

if (isForensicProductionDelivery(FORENSIC_GMAIL)
  && !providerCallAllowed("claimed", { delivery_id: FORENSIC_GMAIL, attempt_count: 1 })
  && mig.includes(FORENSIC_GMAIL)) {
  pass("22.forensic_gmail", "forensic Gmail delivery remains excluded");
} else fail("22.forensic_gmail", "forensic Gmail can be sent");

if (BUSINESS.every((id) => !mig.includes(id))
  && !/cron\.schedule/.test(mig)
  && !/EMAIL_ENABLED\s*=\s*true/.test(mig)
  && !/EMAIL_PRODUCTION_DISPATCH\s*=\s*true/.test(mig)
  && !/UPDATE public\.notification_email_routes/.test(mig)
  && /REVOKE ALL ON FUNCTION public\.claim_notification_email_production_delivery\(uuid\) FROM authenticated/.test(mig)
  && /GRANT EXECUTE ON FUNCTION public\.claim_notification_email_production_delivery\(uuid\) TO service_role/.test(mig)
  && /\[functions\.resend-notification-webhook\]\s+verify_jwt = false/.test(config)
  && !/schedule\s*=/.test(config)
  && /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN/.test(p0)) {
  pass("static.safety", "migration is additive, unscheduled, and does not name the business rows or edit P0");
} else fail("static.safety", "migration or config safety check failed");

if (/https:\/\/app\.primecarediagnostics\.in/.test(stored)) {
  pass("static.cta", "production CTA falls back to the production portal");
} else fail("static.cta", "production CTA fallback missing");

console.log(failures ? `\nPRODUCTION DISPATCH: BLOCKED (${failures})\n` : "\nPRODUCTION DISPATCH: PASS\n");
process.exit(failures ? 1 : 0);
