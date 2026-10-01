/** Resend/Svix webhook verification. No database. No secrets logged. */

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

function str(v) {
  return String(v ?? "").trim();
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeWebhookSecret(secret) {
  const raw = str(secret).replace(/^whsec_/, "");
  if (!raw) return null;
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  const len = Math.max(left.length, right.length, 1);
  let out = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    out |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return out === 0 && left.length > 0 && right.length > 0;
}

export async function verifySvixSignature({
  secret,
  payload,
  id,
  timestamp,
  signature,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const headerId = str(id);
  const headerTimestamp = str(timestamp);
  const headerSignature = str(signature);
  const body = String(payload ?? "");
  const stamp = Number(headerTimestamp);
  if (!headerId || !headerSignature || !Number.isFinite(stamp)) {
    return { ok: false, reason: "missing_signature" };
  }
  if (Math.abs(nowSeconds - stamp) > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }
  let keyBytes;
  try {
    keyBytes = decodeWebhookSecret(secret);
  } catch {
    return { ok: false, reason: "bad_secret" };
  }
  if (!keyBytes || !keyBytes.length) return { ok: false, reason: "missing_secret" };

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${headerId}.${headerTimestamp}.${body}`),
  );
  const expected = bytesToBase64(new Uint8Array(signed));
  const candidates = headerSignature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));
  const match = candidates.some((candidate) => timingSafeEqual(candidate, expected));
  return match ? { ok: true, reason: "verified" } : { ok: false, reason: "bad_signature" };
}

export function applyProviderTelemetry(row, event, seenIds) {
  const seen = seenIds instanceof Set ? seenIds : new Set();
  const type = String(event?.type || "");
  const svixId = String(event?.svixId || "");
  if (!svixId) return { result: "ignored", row };
  if (seen.has(svixId)) return { result: "duplicate", row };
  if (!["email.delivered", "email.bounced", "email.complained"].includes(type)) {
    return { result: "ignored", row };
  }
  if (!event?.providerMessageId || row?.providerMessageId !== event.providerMessageId) {
    seen.add(svixId);
    return { result: "unmatched", row };
  }
  if (row.status !== "sent") {
    seen.add(svixId);
    return { result: "unmatched", row };
  }
  const next = { ...row };
  if (type === "email.delivered" && !next.deliveredAt) next.deliveredAt = event.occurredAt;
  if (type === "email.bounced" && !next.bouncedAt) next.bouncedAt = event.occurredAt;
  if (type === "email.complained" && !next.complainedAt) next.complainedAt = event.occurredAt;
  seen.add(svixId);
  return { result: "recorded", row: next };
}
