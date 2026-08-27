#!/usr/bin/env node
/**
 * Static verification for the public marketing website.
 * Ensures portal isolation and required public-site contracts.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const repoRoot = resolve(root, "..");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(cond, id, detail) {
  cond ? pass(id, detail) : fail(id, detail);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === "dist") continue;
      walkJs(full, out);
    } else if (/\.(jsx?|tsx?|css|html|json|mjs)$/.test(name.name)) {
      out.push(full);
    }
  }
  return out;
}

const app = read("src/App.jsx");
const contact = read("src/config/publicContact.js");
const connect = read("src/ConnectPage.jsx");
const main = read("src/main.jsx");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));

assert(pkg.name === "primecare-website", "pkg.name", "isolated package name");
assert(!existsSync(resolve(root, "supabase")), "iso.no_supabase", "website package has no supabase folder");
assert(
  !/from ["']@supabase|createClient|AuthContext|PortalLayout|Predator/.test(app + contact + connect + main),
  "iso.no_portal_imports",
  "public app does not import portal auth/supabase/predator"
);

const allSrc = walkJs(resolve(root, "src"))
  .concat([resolve(root, "index.html"), resolve(root, "package.json")])
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

assert(!/VITE_SUPABASE|service_role|tenant_id|RLS/.test(allSrc), "sec.no_secrets", "no supabase/tenant secrets in public site");
assert(/app\.primecarediagnostics\.in/.test(app + contact), "portal.link", "customer login points to app subdomain");
assert(/www\.primecarediagnostics\.in/.test(html + contact), "seo.canonical", "canonical www domain present");
assert(/WhatsApp Us/.test(app), "cta.whatsapp", "primary WhatsApp CTA present");
assert(/Request a Quote/.test(app), "cta.quote", "quote CTA present");
assert(/wa\.me/.test(contact), "wa.builder", "WhatsApp wa.me builder present");
assert(/VITE_PUBLIC_WHATSAPP_E164/.test(contact), "wa.env", "WhatsApp number comes from env");
assert(/formatPublicPhoneDisplay/.test(contact), "wa.display_helper", "human-readable phone formatter present");
assert(!/98765|99999|00000/.test(contact), "wa.no_fake", "no invented placeholder phone hardcoded as live");
assert(!/919502620383/.test(app + contact), "wa.no_hardcode", "Founder WhatsApp digits not hardcoded in source");
assert(/Laboratory Consumables/.test(app) && /Diagnostic Supplies/.test(app), "products.categories", "required category cards present");
assert(
  /IVD \/ Reagent Requirements/.test(app) && !/IVD \/ Reagent Supply/.test(app),
  "products.ivd_requirements",
  "IVD category uses Requirements wording"
);
assert(/Hyderabad/.test(app + contact), "geo.hyderabad", "service area stated");
assert(
  !/#1 supplier|lowest pricing|lowest price|AI-powered|in minutes|guaranteed|fastest|nationwide|industry-leading|available now|in stock|delivery in minutes/i.test(
    app + connect
  ),
  "copy.no_hype",
  "no unverifiable stock, price, or response-time claims"
);
assert(!/Existing Customer\? Login/.test(app), "hero.no_tertiary_login", "hero tertiary login link removed");
assert(
  !/pending configuration|not configured yet|VITE_PUBLIC_WHATSAPP_E164 before|Business email pending/i.test(app),
  "ui.no_config_leak",
  "customer UI does not expose config status"
);
assert(/Already a PrimeCare customer/.test(app), "customers.section", "existing customer section present");
assert(
  /Diagnostic &amp; Laboratory Supply Solutions — Hyderabad|Diagnostic & Laboratory Supply Solutions — Hyderabad/.test(app),
  "hero.headline",
  "Sep 1 hero headline present"
);
assert(/id="about"/.test(app) && /About PrimeCare/.test(app), "about.section", "About PrimeCare section present");
assert(
  /supplier confirmation and applicable regulatory requirements/.test(app),
  "products.disclaimer",
  "product availability disclaimer present"
);
assert(
  /Confirm &amp; coordinate supply|Confirm & coordinate supply/.test(app) &&
    /confirm the agreed products, pricing and next steps/.test(app),
  "how.step3",
  "How it works step 3 uses Confirm & coordinate supply"
);
assert(
  /Discuss Your Requirements/.test(app) && !/<h2>Request a quote<\/h2>/.test(app),
  "enquiry.heading",
  "enquiry section heading is Discuss Your Requirements"
);
assert(
  /productsBrands/.test(app) && /monthlyRequirement/.test(app) && /procurementChallenge/.test(app),
  "enquiry.fields",
  "discovery enquiry fields present"
);
assert(
  /id="labName"[\s\S]*?\brequired\b/.test(app) &&
    /id="contactPerson"[\s\S]*?\brequired\b/.test(app) &&
    /id="location"[\s\S]*?\brequired\b/.test(app) &&
    /id="productsBrands"[\s\S]*?\brequired\b/.test(app),
  "enquiry.required_fields",
  "lab, contact, area, and products/brands are required"
);
assert(
  /monthlyRequirement[\s\S]*?\(optional\)/.test(app) &&
    /procurementChallenge[\s\S]*?\(optional\)/.test(app) &&
    !/id="monthlyRequirement"[\s\S]*?\brequired\b/.test(app) &&
    !/id="procurementChallenge"[\s\S]*?\brequired\b/.test(app),
  "enquiry.optional_fields",
  "monthly requirement and procurement challenge are optional"
);
assert(
  /laboratory procurement requirements/.test(contact) && /Products \/ Brands:/.test(contact),
  "enquiry.whatsapp_format",
  "WhatsApp enquiry message format present"
);
assert(
  /if \(monthlyRequirement\) lines\.push/.test(contact) &&
    /if \(procurementChallenge\) lines\.push/.test(contact),
  "enquiry.omit_empty_optional",
  "empty optional WhatsApp fields are omitted"
);
assert(
  /Technology-enabled ordering and account access/.test(app),
  "customers.labos_secondary",
  "customer portal pitch stays secondary and subtle"
);
assert(
  /PrimeCare Diagnostics · Hyderabad, Telangana/.test(app),
  "footer.identity",
  "footer trade identity line present without invented GST"
);
assert(
  !/People Operations|Financial Intelligence|Credit & Risk|Payroll|Executive Intelligence|GSTIN|GST\b/.test(app),
  "copy.no_internal_modules",
  "no internal ERP module names or invented GST"
);

const portalTouched = [
  "primecare-portal/src/App.jsx",
  "primecare-portal/src/main.jsx",
  "primecare-portal/vercel.json",
  "primecare-portal/package.json",
].every((rel) => {
  const run = spawnSync("git", ["diff", "--name-only", "HEAD", "--", rel], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return !(run.stdout || "").trim();
});
assert(/ConnectPage/.test(main) && /\/connect/.test(main), "connect.route", "SPA renders ConnectPage at /connect");
assert(/PrimeCare Diagnostics \| Connect/.test(connect), "connect.title", "connect page title set");
assert(/WhatsApp PrimeCare/.test(connect) && /Call PrimeCare/.test(connect), "connect.ctas", "WhatsApp and Call CTAs present");
assert(/href="\/#enquiry"/.test(connect) && /Request a Quote/.test(connect), "connect.quote_reuse", "quote CTA reuses homepage enquiry form");
assert(/href="\/"/.test(connect) && /Visit Website/.test(connect), "connect.home_link", "visit website returns to homepage");
assert(/buildTelHref/.test(contact) && /tel:\+/.test(contact), "connect.tel_builder", "Call uses tel: from the same WhatsApp env number");
assert(/buildTelHref/.test(connect) && /buildWhatsAppHref/.test(connect), "connect.reuse_contact", "connect page reuses public contact helpers");
assert(!/gtag|analytics|plausible|umami|GTM-/.test(connect + main), "connect.no_new_analytics", "no new analytics infrastructure");
assert(!/98765|99999|00000|919502620383/.test(connect), "connect.no_hardcode", "connect page does not hardcode phone numbers");

assert(portalTouched, "iso.portal_untouched", "core portal runtime files not modified in this working tree vs HEAD");

const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
assert((build.status ?? 1) === 0, "build", (build.status ?? 1) === 0 ? "vite build succeeded" : (build.stderr || build.stdout || "").slice(-400));

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))\n`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
