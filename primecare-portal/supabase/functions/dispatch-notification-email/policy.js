/** Shared QA email dispatch policy (plain ESM). No secrets. No network. */

export const MAX_ATTEMPTS = 4;
export const CLAIM_BATCH_SIZE = 10;
/** Legacy domain list. Not used for Resend To (PN-1B3A). */
export const DEFAULT_QA_ALLOWLIST = ["primecare.test"];
/** PN-EMAIL Stage 2A — explicit Production certification marker. Not a customer event. */
export const STAGE2_CERT_KIND = "pn_email_stage2";
export const STAGE2_CERT_MODE = "pn_email_stage2_certification";
export const STAGE2_CERT_EVENT_TYPE = "pn_email_stage2_certification";
export const STAGE2_CERT_SUBJECT = "PrimeCare Production Email Certification";
export const STAGE2_CERT_BODY =
  "This is a controlled PrimeCare production email delivery certification. No customer or lab action is required.";
export const STAGE2_CERT_DELIVERY_ID = "3face3b7-abac-46ff-839a-eccc1ef2b79e";
/** PN-EMAIL Stage 3E — exact-row real-recipient lifecycle certification. */
export const STAGE3E_MODE = "pn_email_stage3e_lifecycle";
export const STAGE3E_LAB_NAME_PREFIX = "PN EMAIL STAGE3E REAL RECIPIENT CERT";
export const STAGE3F_LAB_NAME_PREFIX = "PN EMAIL STAGE3F REAL RECIPIENT CERT";
export const STAGE3F_COPY_KIND = "pn_email_stage3f_activated_copy";
export const STAGE3F_COPY_MODE = "pn_email_stage3f_activated_copy";
export const STAGE3F_CERT_LAB_ID = "LAB-P-E9FFF046A399";
export const STAGE3E_FORENSIC_DELIVERY_IDS = [
  "c02c0d63-9a0f-4ec6-8966-6035258364ad",
  "424796d2-3e78-438c-8fb6-ab5c3bb3e28b",
  "63561826-8bb3-4004-b857-b58c397b2aae",
  "b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64",
  "3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79",
  "fd799383-62f3-499f-a1e3-17c1bdc4ea89",
];

export function str(v) {
  return String(v ?? "").trim();
}

export function lower(v) {
  return str(v).toLowerCase();
}

export function maskEmail(email) {
  const raw = lower(email);
  const at = raw.indexOf("@");
  if (at <= 0) return "***";
  return `${raw[0]}***@${raw.slice(at + 1)}`;
}

export function escapeHtml(value) {
  return str(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailDomain(email) {
  const raw = lower(email);
  const at = raw.lastIndexOf("@");
  if (at < 0) return "";
  return raw.slice(at + 1);
}

const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Canonical Production lifecycle dispatch eligibility.
 * Syntax-usable AND not a .local / primecare.local domain.
 * Does not reject Gmail. Does not require a company domain.
 */
export function isProductionDispatchableEmail(email) {
  const raw = lower(email);
  if (!raw || !EMAIL_SYNTAX_RE.test(raw)) return false;
  const domain = emailDomain(raw);
  if (!domain) return false;
  if (domain === "local" || domain === "primecare.local" || domain.endsWith(".local")) {
    return false;
  }
  return true;
}

export const NON_DISPATCHABLE_DOMAIN = "non_dispatchable_domain";

export function parseAllowlist(raw) {
  const parts = str(raw)
    .split(/[,\s]+/)
    .map((d) => lower(d).replace(/^@/, ""))
    .filter(Boolean);
  return parts.length ? parts : [...DEFAULT_QA_ALLOWLIST];
}

export function isPersonalWebmail(domain) {
  const d = lower(domain);
  if (!d) return false;
  if (d === "gmail.com" || d === "googlemail.com") return true;
  if (d === "outlook.com" || d === "hotmail.com" || d === "live.com" || d === "msn.com") return true;
  if (d === "yahoo.com" || d.startsWith("yahoo.") || d.endsWith(".yahoo.com")) return true;
  return false;
}

export function isAllowlisted(domain, allowlist) {
  const d = lower(domain);
  return (allowlist || []).some((item) => d === lower(item));
}

export function isTruthyEnv(v) {
  const s = lower(v);
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * EMAIL_ENABLED=false → do not claim and do not call provider.
 */
export function shouldClaimRows(emailEnabled) {
  return isTruthyEnv(emailEnabled);
}

export function isQaSafetyOn({ appEnv, qaMode }) {
  return lower(appEnv) === "qa" || isTruthyEnv(qaMode);
}

export function parseExactAllowlist(raw) {
  return str(raw)
    .split(/[,\s]+/)
    .map((item) => lower(item))
    .filter((item) => item.includes("@"));
}

export function isSyntheticQaDomain(domain) {
  return lower(domain) === "primecare.test" || lower(domain).endsWith(".primecare.test");
}

/**
 * Resolve the actual provider recipient without mutating the intended snapshot.
 * Domain EMAIL_QA_ALLOWLIST is ignored for Resend To (not provider-deliverable).
 * @returns {{ action: "send"|"rewrite"|"suppress", providerTo: string, reason: string }}
 */
export function resolveQaRecipient({
  intendedEmail,
  qaMode,
  appEnv,
  allowlistRaw: _allowlistRaw,
  exactAllowlistRaw,
  testRecipient,
}) {
  const intended = lower(intendedEmail);
  const testTo = lower(testRecipient);
  const qaOn = isQaSafetyOn({ appEnv, qaMode });
  const intendedDomain = emailDomain(intended);
  const exactAllowlist = parseExactAllowlist(exactAllowlistRaw);

  if (!qaOn) {
    return { action: "suppress", providerTo: "", reason: "production_freeze" };
  }
  if (!intended || !intended.includes("@")) {
    return { action: "suppress", providerTo: "", reason: "missing_recipient" };
  }

  const exactTestRecipient = Boolean(testTo) && intended === testTo;
  const exactAllowlisted =
    exactAllowlist.includes(intended) &&
    !isSyntheticQaDomain(intendedDomain) &&
    !isPersonalWebmail(intendedDomain);

  if (exactTestRecipient || exactAllowlisted) {
    return {
      action: "send",
      providerTo: intended,
      reason: exactTestRecipient ? "qa_test_recipient" : "qa_exact_allowlist",
    };
  }

  if (!testTo) {
    return { action: "suppress", providerTo: "", reason: "qa_suppressed" };
  }

  return {
    action: "rewrite",
    providerTo: testTo,
    reason: isSyntheticQaDomain(intendedDomain)
      ? "qa_rewrite_synthetic"
      : isPersonalWebmail(intendedDomain)
        ? "qa_rewrite_personal"
        : "qa_rewrite",
  };
}

export function emailsEqual(a, b) {
  const left = lower(a);
  const right = lower(b);
  return Boolean(left) && left === right && left.includes("@");
}

export function isCertificationRequest(body) {
  return lower(body?.mode) === STAGE2_CERT_MODE;
}

export function isStage3eRequest(body) {
  return lower(body?.mode) === STAGE3E_MODE;
}

export function isStage3fActivatedCopyRequest(body) {
  return lower(body?.mode) === STAGE3F_COPY_MODE;
}

export function isProductionBatchClaimForbidden({ appEnv, qaMode }) {
  return lower(appEnv) === "prod" && !isTruthyEnv(qaMode);
}

export function isStage3eLabNameEligible(name) {
  const n = str(name).toUpperCase();
  return n.startsWith(STAGE3E_LAB_NAME_PREFIX) || n.startsWith(STAGE3F_LAB_NAME_PREFIX);
}

export function isStage3eEventType(eventType) {
  const type = lower(eventType);
  return type === "prospect_created" || type === "prospect_activated";
}

export function isStage3eRecipientRole(eventType, role) {
  const r = lower(role);
  if (r === "lab" || r === "customer") return false;
  if (lower(eventType) === "prospect_created") {
    return r === "admin" || r === "executive" || r === "operations" || r === "";
  }
  if (lower(eventType) === "prospect_activated") return r === "agent";
  return false;
}

export function stage3eDeniedDelivery(deliveryId) {
  const id = lower(deliveryId);
  if (!id) return { denied: true, reason: "missing_delivery_id" };
  if (STAGE3E_FORENSIC_DELIVERY_IDS.includes(id)) {
    return { denied: true, reason: "rejected_forensic" };
  }
  if (id === lower(STAGE2_CERT_DELIVERY_ID)) {
    return { denied: true, reason: "rejected_stage2_cert" };
  }
  return { denied: false, reason: "" };
}

/**
 * Stage 3E env gate. EMAIL_ENABLED=false fails closed.
 * Does not open normal batch. Does not require EMAIL_PROD_TEST_RECIPIENT.
 */
export function evaluateStage3eEnv({
  emailEnabled,
  appEnv,
  qaMode,
  stage3eMode,
}) {
  if (!shouldClaimRows(emailEnabled)) {
    return { ok: false, reason: "email_disabled" };
  }
  if (!stage3eMode) {
    return { ok: false, reason: "not_stage3e_mode" };
  }
  if (lower(appEnv) !== "prod") {
    return { ok: false, reason: "stage3e_prod_only" };
  }
  if (isTruthyEnv(qaMode)) {
    return { ok: false, reason: "stage3e_qa_mode_forbidden" };
  }
  return { ok: true, reason: "env_ready" };
}

/**
 * Production Stage 2A env gate. Does not inspect a delivery row.
 * EMAIL_ENABLED=false always fails closed (no provider send).
 */
export function evaluateProductionCertificationEnv({
  emailEnabled,
  appEnv,
  qaMode,
  certificationMode,
  prodTestRecipient,
}) {
  if (!shouldClaimRows(emailEnabled)) {
    return { ok: false, reason: "email_disabled" };
  }
  if (!certificationMode) {
    return { ok: false, reason: "not_certification_mode" };
  }
  if (lower(appEnv) !== "prod") {
    return { ok: false, reason: "certification_prod_only" };
  }
  if (isTruthyEnv(qaMode)) {
    return { ok: false, reason: "certification_qa_mode_forbidden" };
  }
  const approved = lower(prodTestRecipient);
  if (!approved || !approved.includes("@")) {
    return { ok: false, reason: "missing_prod_test_recipient" };
  }
  return { ok: true, reason: "env_ready", approvedRecipient: approved };
}

/**
 * Production Stage 2A row gate. Certification marker is required; recipient
 * must equal EMAIL_PROD_TEST_RECIPIENT. Address alone is not sufficient.
 */
export function evaluateProductionCertificationRow({
  certificationKind,
  intendedEmail,
  approvedRecipient,
  deliveryId,
}) {
  if (!str(deliveryId)) {
    return { ok: false, reason: "missing_delivery_id" };
  }
  if (lower(certificationKind) !== STAGE2_CERT_KIND) {
    return { ok: false, reason: "not_certification_row" };
  }
  if (!emailsEqual(intendedEmail, approvedRecipient)) {
    return { ok: false, reason: "recipient_mismatch" };
  }
  return {
    ok: true,
    reason: "certification_eligible",
    providerTo: lower(approvedRecipient),
  };
}

export function renderCertificationEmail({ appPublicUrl } = {}) {
  const portal = str(appPublicUrl).replace(/\/$/, "") || "https://app.primecarediagnostics.in";
  const subject = STAGE2_CERT_SUBJECT;
  const text = [STAGE2_CERT_BODY, `Portal: ${portal}`].join("\n");
  const html = `<p>${escapeHtml(STAGE2_CERT_BODY)}</p>
<p>Portal: <a href="${escapeHtml(portal)}">${escapeHtml(portal)}</a></p>`;
  return { ok: true, subject, text, html };
}

export function nextAttemptAtIso(attemptCount, now = new Date()) {
  const n = Number(attemptCount) || 0;
  if (n >= MAX_ATTEMPTS) return null;
  const ms =
    n === 1 ? 5 * 60 * 1000 : n === 2 ? 30 * 60 * 1000 : n === 3 ? 4 * 60 * 60 * 1000 : 0;
  if (!ms) return null;
  return new Date(now.getTime() + ms).toISOString();
}

export function classifyProviderError(status, kind) {
  const k = lower(kind);
  if (k === "timeout" || k === "network" || k === "abort") {
    return { retryable: true, errorCode: "provider_timeout" };
  }
  const code = Number(status);
  if (code === 429) return { retryable: true, errorCode: "provider_rate_limited" };
  if (code >= 500 && code <= 599) return { retryable: true, errorCode: "provider_5xx" };
  if (code >= 400 && code < 500) return { retryable: false, errorCode: "provider_permanent" };
  return { retryable: true, errorCode: "provider_unknown" };
}

export function payloadText(payload, key) {
  if (!payload || typeof payload !== "object") return "";
  return str(payload[key]);
}

export function renderProspectCreated({ payload, appPublicUrl }) {
  const labName = payloadText(payload, "lab_name") || "Prospect";
  const contact = payloadText(payload, "contact_name");
  const phone = payloadText(payload, "phone");
  const area = payloadText(payload, "area");
  const agent = payloadText(payload, "sourcing_agent_name") || payloadText(payload, "sourcing_agent_id");
  const created = payloadText(payload, "created_at");
  const cta = `${str(appPublicUrl).replace(/\/$/, "")}/labs`;
  const subject = `New PrimeCare Prospect: ${labName}`;
  const text = [
    "A new PrimeCare Prospect is ready for review.",
    `Lab: ${labName}`,
    contact ? `Contact: ${contact}` : "",
    phone ? `Phone: ${phone}` : "",
    area ? `Area: ${area}` : "",
    agent ? `Sourcing Agent: ${agent}` : "",
    created ? `Created: ${created}` : "",
    `Review Prospect: ${cta}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<p>A new PrimeCare Prospect is ready for review.</p>
<p><strong>Lab:</strong> ${escapeHtml(labName)}</p>
${contact ? `<p><strong>Contact:</strong> ${escapeHtml(contact)}</p>` : ""}
${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
${area ? `<p><strong>Area:</strong> ${escapeHtml(area)}</p>` : ""}
${agent ? `<p><strong>Sourcing Agent:</strong> ${escapeHtml(agent)}</p>` : ""}
${created ? `<p><strong>Created:</strong> ${escapeHtml(created)}</p>` : ""}
<p><a href="${escapeHtml(cta)}">Review Prospect</a></p>`;
  return { subject, text, html };
}

export function renderProspectActivated({ payload, appPublicUrl, assignedName }) {
  const labName = payloadText(payload, "lab_name") || "Prospect";
  const activated = payloadText(payload, "activated_at");
  const nextAction = payloadText(payload, "next_action") || "Open the lab and continue coverage.";
  const cta = `${str(appPublicUrl).replace(/\/$/, "")}/labs`;
  const assignment = str(assignedName);
  const subject = `Prospect Approved: ${labName}`;
  const text = [
    `${labName} has been approved.`,
    activated ? `Activation time: ${activated}` : "",
    assignment ? `Current assignment: ${assignment}` : "",
    `Next action: ${nextAction}`,
    `Open Lab: ${cta}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<p>${escapeHtml(labName)} has been approved.</p>
${activated ? `<p><strong>Activation time:</strong> ${escapeHtml(activated)}</p>` : ""}
${assignment ? `<p><strong>Current assignment:</strong> ${escapeHtml(assignment)}</p>` : ""}
<p><strong>Next action:</strong> ${escapeHtml(nextAction)}</p>
<p><a href="${escapeHtml(cta)}">Open Lab</a></p>`;
  return { subject, text, html };
}

export function renderForEventType(eventType, args) {
  const type = lower(eventType);
  if (type === "prospect_created") return { ok: true, ...renderProspectCreated(args) };
  if (type === "prospect_activated") return { ok: true, ...renderProspectActivated(args) };
  if (type === STAGE2_CERT_EVENT_TYPE) return renderCertificationEmail(args);
  return { ok: false, errorCode: "unsupported_event_type" };
}
