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
  serviceArea: "Hyderabad, Telangana",
  whatsappE164: e164,
  whatsappDisplay: formatPublicPhoneDisplay(e164),
  contactEmail: email,
  hasWhatsApp: e164.length >= 10,
  hasEmail: Boolean(email && email.includes("@")),
});

const DEFAULT_WHATSAPP_INTRO =
  "Hello PrimeCare Diagnostics, I would like to discuss my laboratory procurement requirements.";

/**
 * @param {string} [message]
 */
export function buildWhatsAppHref(message) {
  if (!PUBLIC_SITE.hasWhatsApp) return null;
  const text = String(message || DEFAULT_WHATSAPP_INTRO).trim();
  return `https://wa.me/${PUBLIC_SITE.whatsappE164}?text=${encodeURIComponent(text)}`;
}

/**
 * Same production number as WhatsApp — used for tel: call links.
 */
export function buildTelHref() {
  if (!PUBLIC_SITE.hasWhatsApp) return null;
  return `tel:+${PUBLIC_SITE.whatsappE164}`;
}

/**
 * @param {{
 *   labName?: string,
 *   contactPerson?: string,
 *   location?: string,
 *   productsBrands?: string,
 *   monthlyRequirement?: string,
 *   procurementChallenge?: string,
 * }} fields
 */
export function buildEnquiryMessage(fields = {}) {
  const lines = [DEFAULT_WHATSAPP_INTRO];
  const labName = String(fields.labName || "").trim();
  const contactPerson = String(fields.contactPerson || "").trim();
  const location = String(fields.location || "").trim();
  const productsBrands = String(fields.productsBrands || "").trim();
  const monthlyRequirement = String(fields.monthlyRequirement || "").trim();
  const procurementChallenge = String(fields.procurementChallenge || "").trim();
  if (labName) lines.push(`Lab: ${labName}`);
  if (contactPerson) lines.push(`Contact: ${contactPerson}`);
  if (location) lines.push(`Area: ${location}`);
  if (productsBrands) lines.push(`Products / Brands: ${productsBrands}`);
  if (monthlyRequirement) lines.push(`Approx. Monthly Requirement: ${monthlyRequirement}`);
  if (procurementChallenge) lines.push(`Procurement Challenge: ${procurementChallenge}`);
  return lines.join("\n");
}
