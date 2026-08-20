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
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));

assert(pkg.name === "primecare-website", "pkg.name", "isolated package name");
assert(!existsSync(resolve(root, "supabase")), "iso.no_supabase", "website package has no supabase folder");
assert(
  !/from ["']@supabase|createClient|AuthContext|PortalLayout|Predator/.test(app + contact),
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
assert(!/98765|99999|00000/.test(contact), "wa.no_fake", "no invented placeholder phone hardcoded as live");
assert(/Blood Collection/.test(app) && /Reagents/.test(app), "products.categories", "required category cards present");
assert(/Hyderabad \/ Telangana/.test(app + contact), "geo.hyderabad", "service area stated");
assert(!/#1 supplier|lowest pricing|AI-powered/.test(app), "copy.no_hype", "no unverifiable hype claims");
assert(/Already a PrimeCare customer/.test(app), "customers.section", "existing customer section present");

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
assert(portalTouched, "iso.portal_untouched", "core portal runtime files not modified in this working tree vs HEAD");

const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
assert((build.status ?? 1) === 0, "build", (build.status ?? 1) === 0 ? "vite build succeeded" : (build.stderr || build.stdout || "").slice(-400));

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))\n`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
