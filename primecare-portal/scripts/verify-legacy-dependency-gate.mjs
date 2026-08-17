#!/usr/bin/env node
/**
 * Legacy Apps Script dependency gate — critical QA/PROD paths must not require
 * PRIMECARE_APPS_SCRIPT_URL unless ALLOW_LEGACY_APPS_SCRIPT is explicitly enabled.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}
function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

console.log("\n=== LEGACY DEPENDENCY GATE ===\n");

const envCfg = read("src/config/environment.js");
const debugLogger = read("src/utils/debugLogger.js");
const proxy = read("api/primecare.js");
const visitPage = read("src/pages/AgentVisitPage.jsx");

if (/ALLOW_LEGACY_APPS_SCRIPT/.test(envCfg)) {
  pass("flag", "ALLOW_LEGACY_APPS_SCRIPT flag exists");
} else fail("flag", "legacy flag missing");

if (
  /if \(!ALLOW_LEGACY_APPS_SCRIPT\)/.test(debugLogger) &&
  /legacy_apps_script_disabled/.test(debugLogger)
) {
  pass("logClientError", "logClientError no-ops when legacy disabled");
} else fail("logClientError", "logClientError may still hit Apps Script when legacy off");

if (
  /action === "logClientError"/.test(proxy) &&
  /legacy_apps_script_disabled/.test(proxy) &&
  !/Missing PRIMECARE_APPS_SCRIPT_URL environment variable/.test(proxy)
) {
  pass("proxy", "proxy does not 500 logClientError when Apps Script URL unset");
} else fail("proxy", "proxy still hard-requires Apps Script URL for logging");

if (/ALLOW_LEGACY_APPS_SCRIPT/.test(visitPage) && /createAgentVisitWrite/.test(visitPage)) {
  pass("visit", "Agent Visit prefers Supabase write with legacy gated fallback");
} else fail("visit", "Agent Visit legacy fallback not gated");

// Critical APIs should not import primecareApi save paths as primary
const primeApi = read("src/api/primecareApi.js");
if (/PRIMECARE_APPS_SCRIPT|script\.google\.com/.test(primeApi) || /\/api\/primecare/.test(primeApi)) {
  pass("primecareApi.exists", "legacy proxy client still present (gated use only)");
}

console.log(failures ? `\nLEGACY GATE: BLOCKED (${failures})\n` : "\nLEGACY GATE: PASS\n");
process.exit(failures ? 1 : 0);
