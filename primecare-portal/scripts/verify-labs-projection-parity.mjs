#!/usr/bin/env node
/**
 * Labs projection parity — v_labs_credit vs read_labs_list_v1.
 * QA shadow only: the UI flag remains OFF unless architecture review approves it.
 * Read-only by default: run repair-labs-projection.mjs --apply to rebuild projections.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_LAB,
} from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const LABS_SLA_MS = 60_000;
const LIMIT = 5000;

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}
function str(v) {
  return String(v ?? "").trim();
}
function key(v) {
  return str(v).toUpperCase();
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v) {
  return Math.round(num(v) * 100) / 100;
}
function bool(v) {
  if (typeof v === "boolean") return v;
  return ["true", "t", "yes", "y", "1", "hold"].includes(str(v).toLowerCase());
}
function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
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
function rowIdentity(row) {
  return `${str(row.tenant_id)}:${key(row.lab_id)}`;
}
function normalize(row = {}) {
  return {
    tenant_id: str(row.tenant_id),
    lab_id: key(row.lab_id),
    lab_name: str(row.lab_name),
    owner_name: str(row.owner_name),
    phone: str(row.phone),
    area: str(row.area),
    status: str(row.status),
    assigned_agent_id: str(row.assigned_agent_id),
    ordering_mode: str(row.ordering_mode || "hq_managed"),
    outstanding: money(row.outstanding),
    credit_limit: money(row.credit_limit),
    days_overdue: num(row.days_overdue),
    allowed_overdue_days: num(row.allowed_overdue_days || 15),
    credit_hold: bool(row.credit_hold),
    credit_status: str(row.credit_status || "OK"),
  };
}
function diffRow(expected, actual) {
  const diffs = [];
  for (const field of Object.keys(expected)) {
    if (expected[field] !== actual[field]) {
      diffs.push(`${field}: legacy=${JSON.stringify(expected[field])} projection=${JSON.stringify(actual[field])}`);
    }
  }
  return diffs;
}
function ids(rows = []) {
  return new Set(rows.map(rowIdentity));
}
function orderedSignature(rows = []) {
  return rows.map(rowIdentity).join("|");
}
function compareProjectionOrder(label, rows = []) {
  const actual = orderedSignature(rows);
  const expected = orderedSignature(
    [...rows].sort((a, b) => {
      const name = str(a.lab_name).localeCompare(str(b.lab_name));
      if (name !== 0) return name;
      return key(a.lab_id).localeCompare(key(b.lab_id));
    })
  );
  if (actual === expected) {
    pass(label, "projection order is deterministic by lab_name, lab_id");
  } else {
    fail(label, "projection order drifted from read_labs_list_v1 contract");
  }
}
function compareLimitWindow(label, limitedRows = [], fullRows = []) {
  const expected = orderedSignature(fullRows.slice(0, limitedRows.length));
  const actual = orderedSignature(limitedRows);
  if (actual === expected) {
    pass(label, `limit window stable (${limitedRows.length} rows)`);
  } else {
    fail(label, "limited read does not match full-read prefix");
  }
}
function compareSets(label, legacyRows, projectionRows, options = {}) {
  const legacy = ids(legacyRows);
  const projection = ids(projectionRows);
  const missing = [...legacy].filter((id) => !projection.has(id));
  const extra = [...projection].filter((id) => !legacy.has(id));
  if (missing.length) {
    fail(label, `missing=${missing.slice(0, 10).join(",") || "none"} extra=${extra.slice(0, 10).join(",") || "none"}`);
  } else if (extra.length && options.allowProjectionOverflow === true && legacyRows.length >= 1000) {
    warn(
      label,
      `projection has ${extra.length} additional visible rows beyond current legacy bounded response`
    );
  } else if (extra.length) {
    fail(label, `missing=none extra=${extra.slice(0, 10).join(",")}`);
  } else {
    pass(label, `${legacy.size} visible rows match`);
  }
}
async function signInRole(client, roleSpec) {
  const res = await signInWithQaCredentials(client, roleSpec.cred, roleSpec.options || {});
  if (!res.ok) {
    fail(`auth.${roleSpec.key}`, res.error || "sign-in failed");
    return false;
  }
  pass(`auth.${roleSpec.key}`, res.email);
  return true;
}
async function readLegacy(client) {
  const { data, error } = await client
    .from("v_labs_credit")
    .select(
      "tenant_id,lab_id,lab_name,owner_name,phone,area,status,assigned_agent_id,ordering_mode,outstanding,credit_limit,days_overdue,allowed_overdue_days,credit_hold,credit_status"
    )
    .limit(LIMIT);
  if (error) return { error: error.message || String(error), rows: [] };
  return { rows: data || [] };
}
async function readProjection(client, limit = LIMIT) {
  const { data, error } = await client.rpc("read_labs_list_v1", { p_limit: limit });
  if (error) return { error: error.message || String(error), rows: [], payload: null };
  const rows = Array.isArray(data?.data) ? data.data : [];
  return { rows, payload: data };
}
async function readProjectionTableRls(client, limit = LIMIT) {
  const { data, error } = await client
    .from("proj_lab_profile_v1")
    .select("tenant_id,lab_id,lab_name")
    .order("lab_name", { ascending: true })
    .order("lab_id", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message || String(error), rows: [] };
  return { rows: data || [] };
}
async function validatePredicateForRows(client, label, rows = []) {
  let checked = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const checks = await Promise.all(
      batch.map(async (row) => {
        const { data, error } = await client.rpc("distributor_lab_record_visible", {
          row_tenant_id: row.tenant_id,
          row_lab_id: row.lab_id,
        });
        return { row, data, error };
      })
    );
    for (const check of checks) {
      if (check.error) {
        fail(`${label}.predicate`, check.error.message || String(check.error));
        return;
      }
      if (check.data !== true) {
        fail(
          `${label}.predicate`,
          `row not visible by distributor_lab_record_visible: ${rowIdentity(check.row)}`
        );
        return;
      }
      checked += 1;
    }
  }
  pass(`${label}.predicate`, `${checked} projection row(s) visible by distributor_lab_record_visible`);
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");

console.log("\n=== Labs projection parity ===\n");
pass("mode.read_only", "verification does not rebuild or mutate projections");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const adapters = await server.ssrLoadModule("/src/api/projectionReadAdapters.js");

  const adminSignedIn = await signInRole(supabase, { key: "admin", cred: QA_ADMIN });
  if (!adminSignedIn) process.exit(1);

  const deployProbe = await supabase.rpc("read_labs_list_v1", { p_limit: 1 });
  if (deployProbe.error?.message?.includes("Could not find")) {
    fail("deploy.read_labs_list_v1", "RPC missing — apply Sprint 8A migration");
    process.exit(1);
  } else if (deployProbe.error) {
    fail("deploy.read_labs_list_v1", deployProbe.error.message);
  } else {
    pass("deploy.read_labs_list_v1", "RPC available");
  }

  const [legacy, projection] = await Promise.all([readLegacy(supabase), readProjection(supabase)]);
  if (legacy.error) fail("legacy.v_labs_credit", legacy.error);
  if (projection.error) fail("projection.read_labs_list_v1", projection.error);

  pass("rows.count", `legacy=${legacy.rows.length} projection=${projection.rows.length}`);
  compareSets("rows.identity", legacy.rows, projection.rows);
  compareProjectionOrder("rows.ordering", projection.rows);
  const projectionLimited = await readProjection(supabase, 25);
  if (projectionLimited.error) fail("rows.limit.projection", projectionLimited.error);
  else compareLimitWindow("rows.limit", projectionLimited.rows, projection.rows);

  const projectionById = new Map(projection.rows.map((r) => [rowIdentity(r), normalize(r)]));
  let drift = 0;
  for (const legacyRow of legacy.rows) {
    const id = rowIdentity(legacyRow);
    const projectionRow = projectionById.get(id);
    if (!projectionRow) continue;
    const diffs = diffRow(normalize(legacyRow), projectionRow);
    if (diffs.length) {
      drift += 1;
      fail(`row.${id}`, diffs.slice(0, 8).join("; "));
      if (drift >= 10) break;
    }
  }
  if (drift === 0) pass("rows.parity", "No field drift across labs UI contract");

  const adapterRes = await adapters.readLabsListV1({ limit: LIMIT, force: true });
  if (!adapterRes?.success) {
    fail("adapter.js", adapterRes?.error || "readLabsListV1 failed");
  } else {
    pass("adapter.js", `${adapterRes.data?.length ?? 0} mapped rows`);
  }

  const staleness = num(projection.payload?.staleness_ms);
  if (staleness > LABS_SLA_MS) {
    fail("freshness.read_labs_list_v1", `${Math.round(staleness / 1000)}s > 60s`);
  } else {
    pass("freshness.read_labs_list_v1", `${Math.round(staleness / 1000)}s`);
  }

  const roleSpecs = [
    { key: "admin", cred: QA_ADMIN },
    { key: "executive", cred: QA_EXECUTIVE },
    {
      key: "agent",
      cred: QA_AGENT,
      options: { fallbackEmail: "qa.agent@primecare.test" },
    },
    { key: "lab", cred: QA_LAB },
  ];

  for (const roleSpec of roleSpecs) {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const ok = await signInRole(client, roleSpec);
    if (!ok) continue;

    const [{ data: profile }, legacyRole, projectionRole, projectionTableRole] = await Promise.all([
      client
        .from("profiles")
        .select("tenant_id,role,lab_id,agent_id")
        .limit(1)
        .maybeSingle(),
      readLegacy(client),
      readProjection(client),
      readProjectionTableRls(client),
    ]);
    if (legacyRole.error) fail(`visibility.${roleSpec.key}.legacy`, legacyRole.error);
    if (projectionRole.error) fail(`visibility.${roleSpec.key}.projection`, projectionRole.error);
    if (projectionTableRole.error) {
      fail(`visibility.${roleSpec.key}.table_rls`, projectionTableRole.error);
    }
    compareSets(`visibility.${roleSpec.key}`, legacyRole.rows, projectionRole.rows, {
      allowProjectionOverflow: roleSpec.key === "executive",
    });
    compareSets(
      `security_definer.${roleSpec.key}`,
      projectionTableRole.rows,
      projectionRole.rows,
      {
        allowProjectionOverflow:
          roleSpec.key === "executive" && projectionTableRole.rows.length >= 1000,
      }
    );
    await validatePredicateForRows(client, `security_definer.${roleSpec.key}`, projectionRole.rows);
    compareProjectionOrder(`ordering.${roleSpec.key}`, projectionRole.rows);

    const tenantId = str(profile?.tenant_id);
    if (roleSpec.key !== "executive" && tenantId) {
      const crossTenant = projectionRole.rows.filter((row) => str(row.tenant_id) !== tenantId);
      if (crossTenant.length) {
        fail(`tenant.${roleSpec.key}`, `cross-tenant projection rows=${crossTenant.length}`);
      } else {
        pass(`tenant.${roleSpec.key}`, "projection tenant scope matches profile tenant");
      }
    }
    await client.auth.signOut();
  }

  console.log("\n=== Labs projection parity complete ===\n");
} finally {
  await server.close();
}

if (process.exitCode) process.exit(process.exitCode);
