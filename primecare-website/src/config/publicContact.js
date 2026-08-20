/**
 * Public marketing contact configuration.
 * WhatsApp / email come from env — never invent production numbers.
 */
const e164 = String(import.meta.env.VITE_PUBLIC_WHATSAPP_E164 || "")
  .replace(/\D/g, "")
  .trim();

const email = String(import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || "").trim();

/**
 * Human-readable display for an E.164 WhatsApp/phone number.
 * Example: 91XXXXXXXXXX → +91 XXXXX XXXXX
 * @param {string} digits
 */
export function formatPublicPhoneDisplay(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  if (!d) return "";
  return `+${d}`;
}

export const PUBLIC_SITE = Object.freeze({
  companyName: "PrimeCare Diagnostics",
  websiteUrl: "https://www.primecarediagnostics.in",
  portalUrl: "https://app.primecarediagnostics.in",
  serviceArea: "Hyderabad / Telangana",
  whatsappE164: e164,
  whatsappDisplay: formatPublicPhoneDisplay(e164),
  contactEmail: email,
  hasWhatsApp: e164.length >= 10,
  hasEmail: Boolean(email && email.includes("@")),
});

/**
 * @param {string} [message]
 */
export function buildWhatsAppHref(message) {
  if (!PUBLIC_SITE.hasWhatsApp) return null;
  const text = String(message || "Hello PrimeCare Diagnostics, I would like a quote for laboratory supplies.").trim();
  return `https://wa.me/${PUBLIC_SITE.whatsappE164}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {{ labName?: string, contactPerson?: string, location?: string, requirement?: string }} fields
 */
export function buildEnquiryMessage(fields = {}) {
  const lines = ["Hello PrimeCare Diagnostics, I would like a quote for laboratory supplies."];
  const labName = String(fields.labName || "").trim();
  const contactPerson = String(fields.contactPerson || "").trim();
  const location = String(fields.location || "").trim();
  const requirement = String(fields.requirement || "").trim();
  if (labName) lines.push(`Lab name: ${labName}`);
  if (contactPerson) lines.push(`Contact person: ${contactPerson}`);
  if (location) lines.push(`Location: ${location}`);
  if (requirement) lines.push(`Requirement: ${requirement}`);
  return lines.join("\n");
}
