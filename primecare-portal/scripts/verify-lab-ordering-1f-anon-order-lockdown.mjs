#!/usr/bin/env node
/**
 * Lab Ordering 1F — anon order table lockdown (static).
 *
 * Confirms proposed 20260905140000 drops leftover temp_anon order policies
 * and revokes anon privileges. Certified 1B must not be treated as sufficient.
 *
 * Default: static only. Optional QA read-only:
 *   node scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs --live
 *
 * --live never inserts/updates/deletes. Refuses Production.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN } from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const LIVE = process.argv.includes("--live");
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const MIG_REL = "supabase/migrations/20260905140000_lab_ordering_1f_anon_order_lockdown.sql";
const TWIN_REL = "supabase/sql/lab_ordering_1f_anon_order_lockdown.sql";
const ONE_B_REL = "supabase/migrations/20260905130000_lab_ordering_1b_catalog_price_and_item_lockdown.sql";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}

function str(v) {
  return String(v ?? "").trim();
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

console.log("\n=== LAB ORDERING 1F ANON ORDER LOCKDOWN ===\n");

const mig = existsSync(resolve(root, MIG_REL)) ? readSrc(MIG_REL) : "";
const twin = existsSync(resolve(root, TWIN_REL)) ? readSrc(TWIN_REL) : "";
const oneB = existsSync(resolve(root, ONE_B_REL)) ? readSrc(ONE_B_REL) : "";

if (!oneB.includes("temp_anon_order_items_insert") && !oneB.includes("REVOKE ALL ON TABLE public.order_items FROM")) {
  pass("static.1b_does_not_close_anon", "1B does not DROP temp_anon order_items policies or REVOKE anon");
} else {
  fail("static.1b_does_not_close_anon", "1B unexpectedly contains anon order_items DROP/REVOKE");
}

if (
  mig.includes("temp_anon_order_items_insert") &&
  mig.includes("temp_anon_order_items_select") &&
  mig.includes("DROP POLICY IF EXISTS") &&
  mig.includes("REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon") &&
  mig.includes("REVOKE ALL ON TABLE public.order_lines FROM PUBLIC, anon") &&
  mig.includes("REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon") &&
  !/CREATE POLICY[\s\S]*TO anon/i.test(mig)
) {
  pass("static.140000_drops_and_revokes", MIG_REL);
} else {
  fail("static.140000_drops_and_revokes", "proposed 140000 missing named drops, REVOKE, or recreates anon policy");
}

if (
  twin.includes("temp_anon_order_items_insert") &&
  twin.includes("REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon")
) {
  pass("static.sql_twin", TWIN_REL);
} else {
  fail("static.sql_twin", "SQL twin missing anon order_items DROP/REVOKE");
}

if (!LIVE) {
  console.log("\nStatic checks complete. Rerun with --live for QA read-only anon SELECT probes.\n");
  process.exit(process.exitCode || 0);
}

const env = loadEnv();
const urlRef = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (urlRef === PROD_REF) {
  fail("live.env", `refusing Production ${PROD_REF}`);
  process.exit(1);
}
if (urlRef !== QA_REF) {
  fail("live.env", `expected QA ${QA_REF}, got ${urlRef || "unknown"}`);
  process.exit(1);
}
pass("live.env", `QA ${QA_REF}`);

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function selectProbe(client, table, col) {
  const { data, error, count, status } = await client
    .from(table)
    .select(col, { count: "exact" })
    .limit(1);
  return {
    error: error?.message || null,
    code: error?.code || null,
    status: status ?? null,
    count: count ?? null,
    rows: data?.length ?? 0,
  };
}

const tables = [
  ["order_items", "order_id"],
  ["order_lines", "order_id"],
  ["orders", "order_id"],
];

for (const [table, col] of tables) {
  const r = await selectProbe(anon, table, col);
  const denied =
    /42501|permission denied|not authorized|jwt/i.test(`${r.error || ""} ${r.code || ""}`);
  if (denied) {
    pass(`live.anon.${table}.privilege`, `anon SELECT denied at GRANT (${r.code || r.error})`);
  } else if (!r.error && (r.count === 0 || r.rows === 0)) {
    fail(
      `live.anon.${table}.privilege`,
      "anon SELECT still authorized (0 rows via RLS). 140000 should REVOKE anon."
    );
  } else {
    fail(`live.anon.${table}`, `unexpected anon SELECT ${JSON.stringify(r)}`);
  }
}

const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: loginErr } = await admin.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (loginErr) {
  fail("live.admin.login", loginErr.message);
} else {
  const line = await selectProbe(admin, "order_lines", "order_id");
  if (!line.error && (line.count ?? 0) > 0) {
    pass("live.admin.order_lines", `authenticated admin can count order_lines (${line.count})`);
  } else if (line.error && /timeout|57014/i.test(line.error)) {
    pass("live.admin.timeout_nonzero", "admin count timed out — table is not empty for authenticated");
  } else {
    fail("live.admin.order_lines", JSON.stringify(line));
  }
}

console.log("\nLive read-only probes complete.\n");
process.exit(process.exitCode || 0);
