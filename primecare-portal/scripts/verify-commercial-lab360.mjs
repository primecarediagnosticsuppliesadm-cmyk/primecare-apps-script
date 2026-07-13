#!/usr/bin/env node
/** Phase 9.0 — Commercial Lab 360 verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/commercial/CommercialLab360Drawer.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/CommercialCrmPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCommercialLab360/.test(modelSrc), "model.lab360", "lab 360 builder");
assert(/Commercial Lab 360/.test(drawerSrc), "ui.drawer", "lab 360 drawer");
assert(/Open Orders/.test(drawerSrc) && /Open Collections/.test(drawerSrc), "ui.deeplinks", "orders/collections deep-links");
assert(/CommercialLab360Drawer/.test(pageSrc), "ui.wired", "drawer wired on page");
assert(!/createOrderWrite|createPaymentWrite/.test(drawerSrc + modelSrc), "guard.no_o2c_writes", "no O2C mutations");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
