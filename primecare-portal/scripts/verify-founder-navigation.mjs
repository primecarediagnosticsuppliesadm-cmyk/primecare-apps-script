#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const menu = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const routing = readFileSync(resolve(root, "src/config/pageRouting.js"), "utf8");
const matrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const platform = readFileSync(resolve(root, "src/platform/platformConsolidationModel.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/founderOperatingSystem/.test(menu), "nav.menu_key", "Founder OS in menu");
assert(/label:\s*"FOUNDER"/.test(menu), "nav.founder_section", "FOUNDER sidebar section");
assert(/keys:\s*\[\s*"founderOperatingSystem"\s*\]/.test(menu), "nav.founder_home", "Founder OS is founder home");
const deepLinkBlock = platform.match(/NAV_DEEP_LINK_ONLY_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
assert(!/founderOperatingSystem/.test(deepLinkBlock), "nav.not_deep_link", "Founder OS not deep-link hidden");
assert(/founder:\s*"founderOperatingSystem"/.test(platform), "platform.founder_home", "Platform workspace home");
assert(/FounderOperatingSystemPage/.test(portal), "portal.route", "Portal routes Founder OS");
assert(/founderNavigation[\s\S]*founderOperatingSystem/.test(routing), "routing.legacy_alias", "founderNavigation aliases to Founder OS");
assert(/founderOperatingSystem:\s*\[/.test(matrix), "perm.founder_os", "Executive permission");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder navigation verified\n");
