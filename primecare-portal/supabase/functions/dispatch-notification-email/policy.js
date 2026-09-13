/** Shared QA email dispatch policy (plain ESM). No secrets. No network. */

export const MAX_ATTEMPTS = 4;
export const CLAIM_BATCH_SIZE = 10;
/** Legacy domain list. Not used for Resend To (PN-1B3A). */
export const DEFAULT_QA_ALLOWLIST = ["primecare.test"];

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
  return { ok: false, errorCode: "unsupported_event_type" };
}
