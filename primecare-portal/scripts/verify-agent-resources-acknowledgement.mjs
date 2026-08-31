#!/usr/bin/env node
/**
 * Agent Resources AR-1C acknowledgement (static).
 * Live V1/V2 ack tests: --remote against QA only.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function src(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function skip(id, d) {
  console.log(`SKIP  ${id}: ${d}`);
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}

const api = src("src/api/agentResourceSupabaseApi.js");
const page = src("src/pages/AgentResourcesPage.jsx");
const publisher = src("src/pages/AgentResourcesPublisherPage.jsx");

assert(/acknowledgeAgentResourceVersionWrite/.test(api), "api.ack_fn", "ack write exists");
assert(/auth\.getUser\(/.test(api), "api.self_session", "ack identity from session");
assert(/23505|duplicate|unique/.test(api), "api.idempotent", "duplicate ack treated as success");
assert(/Could not mark this resource as read/.test(api), "api.ack_error", "user-readable ack error");
assert(/Mark as Read/.test(page), "ui.mark", "explicit Mark as Read");
assert(!/Mark as Read/.test(publisher), "ui.publisher_no_ack", "publisher has no Mark as Read");
assert(!/localStorage/.test(page) && !/localStorage/.test(api), "no.localstorage", "ack SoT is not localStorage");
assert(!/notification/.test(page), "no.notifications", "ack is not notification status");
assert(/getAgentResourceSignedUrl/.test(page), "open.signed", "Open uses signed URL");
const openFn = page.match(/async function onOpen[\s\S]*?async function onMarkRead/)?.[0] || "";
assert(Boolean(openFn) && !/acknowledgeAgentResourceVersionWrite/.test(openFn), "open.no_auto_ack", "Open does not call ack");

if (!process.argv.includes("--remote")) {
  skip("live.ack", "pass --remote after QA apply; static acknowledgement contract verified above");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources acknowledgement contract (static)\n");

if (process.argv.includes("--remote")) {
  const { runLiveAcknowledgement, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLiveAcknowledgement();
  finishLive("Agent Resources acknowledgement", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
