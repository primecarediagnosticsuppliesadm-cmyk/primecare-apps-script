#!/usr/bin/env node
/**
 * Notification contract certification (static, read-only).
 * Extracted/aligned with agent-visit notification assertions — no DB mutation.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_FOUNDATION_MANIFEST } from "./lib/primecareReleaseManifest.mjs";

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

console.log("\n=== PRIMECARE NOTIFICATION CONTRACT ===\n");

const createSrc = read("src/notifications/createNotificationEvent.js");
const insertSrc = read("src/notifications/notificationEventInsert.js");
const deliveryWrite = existsSync(resolve(root, "src/notifications/notificationDeliveryLogWrite.js"))
  ? read("src/notifications/notificationDeliveryLogWrite.js")
  : "";
const visitPage = read("src/pages/AgentVisitPage.jsx");
const fireSrc = read("src/notifications/fireNotificationEvent.js");

if (/NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS/.test(insertSrc)) {
  pass("payload.allowlist", "delivery insert allowlist exported");
} else fail("payload.allowlist", "missing NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS");

for (const col of RELEASE_FOUNDATION_MANIFEST.forbiddenDeliveryColumns) {
  if (new RegExp(`${col}\\s*:`).test(createSrc) || new RegExp(`${col}\\s*:`).test(insertSrc)) {
    fail(`payload.legacy.${col}`, `legacy field still in insert path`);
  } else pass(`payload.legacy.${col}`, "not in insert contract");
}

if (/asUuidOrNull/.test(insertSrc) && /actor_user_id: actorUserId/.test(insertSrc)) {
  pass("uuid.actor", "non-UUID actors nullified for uuid columns");
} else fail("uuid.actor", "UUID guard missing");

if (
  /from "@\/api\/supabaseClient\.js"/.test(createSrc) &&
  /insertNotificationDeliveryLogRows/.test(createSrc) &&
  /from "@\/api\/supabaseClient\.js"/.test(deliveryWrite) &&
  !/\bfetch\s*\(/.test(createSrc) &&
  !/\bfetch\s*\(/.test(deliveryWrite) &&
  !/rest\/v1\/notification_/.test(createSrc)
) {
  pass("client.canonical", "browser writes use canonical supabase client");
} else fail("client.canonical", "raw HTTP or missing canonical client path");

if (
  /\.insert\(\[foundationRow\]\)/.test(createSrc) &&
  !/\.insert\(\[foundationRow\]\)\s*\.select\(/.test(createSrc) &&
  /Client-generated event_id/.test(createSrc)
) {
  pass("insert.no_returning", "agent admin-targeted inserts omit SELECT RETURNING");
} else fail("insert.no_returning", "RETURNING still required (SELECT RLS risk)");

if (
  /void createNotificationEvent/.test(fireSrc) &&
  !/from\("notification_delivery_log"\)/.test(visitPage) &&
  /fireNotificationEvent/.test(read("src/api/primecareSupabaseApi.js"))
) {
  pass("fire_and_forget", "delivery/event side effects outside visit SoT path");
} else fail("fire_and_forget", "notification writes may be on visit critical path");

for (const mig of [
  "20260816140000_notification_events_foundation_parity.sql",
  "20260816145000_notification_event_visibility_helper_parity.sql",
  "20260816150000_notification_delivery_log_parity.sql",
]) {
  if (existsSync(resolve(root, "supabase/migrations", mig))) pass(`db.${mig}`, "versioned");
  else fail(`db.${mig}`, "missing migration");
}

console.log(failures ? `\nNOTIFICATION CONTRACT: BLOCKED (${failures})\n` : "\nNOTIFICATION CONTRACT: PASS\n");
process.exit(failures ? 1 : 0);
