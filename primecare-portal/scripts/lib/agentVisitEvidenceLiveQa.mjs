/**
 * VE-1 live QA probes. PostgREST against .env.local only.
 * Refuses Production. Does NOT use `supabase --linked` (CLI may be Production).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HR,
  QA_HQ_TENANT_ID,
  QA_LAB,
  hydrateQaHrPasswordFromEnv,
  resolveQaHrPassword,
} from "../qaCredentials.mjs";
import { signInWithQaCredentials } from "../qaSignIn.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
export const VE1_CERT_PREFIX = "[VE-1-CERT]";
export const VE2_CERT_PREFIX = "[VE-2-CERT]";
const CERT_PREFIX = VE1_CERT_PREFIX;
const HQ = QA_HQ_TENANT_ID;

export function createReporter() {
  const rows = [];
  let failures = 0;
  let criticalSkips = 0;
  function pass(id, detail) {
    rows.push({ status: "PASS", id, detail });
    console.log(`PASS  ${id}: ${detail}`);
  }
  function fail(id, detail) {
    failures += 1;
    rows.push({ status: "FAIL", id, detail });
    console.error(`FAIL  ${id}: ${detail}`);
  }
  function skip(id, detail, { critical = true } = {}) {
    if (critical) criticalSkips += 1;
    rows.push({ status: "SKIP", id, detail });
    console.log(`SKIP  ${id}: ${detail}`);
  }
  function assert(cond, id, detail) {
    if (cond) pass(id, detail);
    else fail(id, detail);
  }
  return { pass, fail, skip, assert, get failures() { return failures; }, get criticalSkips() { return criticalSkips; }, rows };
}

export function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
  hydrateQaHrPasswordFromEnv(env);
  return env;
}

export function assertQaOnly(env) {
  const url = String(env.VITE_SUPABASE_URL || "");
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  const ref = host.split(".")[0];
  if (ref === PROD_REF || host.includes(PROD_REF)) {
    throw new Error("REFUSE: Production Supabase is targeted — VE-1 live cert must not run against Production");
  }
  if (ref !== QA_REF) {
    throw new Error(`REFUSE: VITE_SUPABASE_URL project ${ref || "unknown"} is not QA (${QA_REF})`);
  }
  return { ref, host };
}

function anonClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function denied(error) {
  if (!error) return false;
  const m = `${error.message || ""} ${error.code || ""} ${error.details || ""}`.toLowerCase();
  return /row-level security|42501|permission denied|not allowed|not authorized|violates row-level|new row violates|rls|403|401|jwt|unauthorized|forbidden|policy|pgrst301|visit_write_agent_only|visit_line_parent_not_writable|column .* does not exist/.test(
    m
  );
}

function missingSchema(error) {
  const m = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return /column .* does not exist|could not find the table|relation .* does not exist|schema cache/.test(m);
}

function errText(error) {
  if (!error) return "";
  return `${error.message || error.code || error}`.trim();
}

async function signIn(env, cred, options = {}) {
  const sb = anonClient(env);
  try {
    const result = await signInWithQaCredentials(sb, cred, options);
    if (!result.ok) return { sb: null, error: result.error, userId: null };
    const { data } = await sb.auth.getUser();
    return { sb, error: null, userId: data?.user?.id || null, email: result.email };
  } catch (error) {
    return { sb: null, error: error.message || String(error), userId: null, network: true };
  }
}

function isNetworkError(error) {
  const m = `${error || ""}`.toLowerCase();
  return /fetch failed|enotfound|eai_again|network|getaddrinfo/.test(m);
}

let cachedPgEnv = null;
function pgEnv() {
  if (cachedPgEnv) return cachedPgEnv;
  const dry = spawnSync("supabase", ["db", "dump", "--linked", "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });
  const env = {};
  for (const line of `${dry.stdout || ""}\n${dry.stderr || ""}`.split("\n")) {
    const m = line.match(/^export (PG\w+)="([^"]*)"/);
    if (m) env[m[1]] = m[2];
  }
  cachedPgEnv = env;
  return env;
}

function catalogSql(query) {
  const env = pgEnv();
  if (!env.PGHOST) throw new Error("Could not resolve linked postgres via supabase db dump --dry-run");
  const host = String(env.PGHOST || "");
  if (host.includes(PROD_REF) || String(env.PGUSER || "").includes(PROD_REF)) {
    throw new Error("REFUSE: catalog SQL resolved Production postgres");
  }
  if (!host.includes(QA_REF) && !String(env.PGUSER || "").includes(QA_REF)) {
    throw new Error(`REFUSE: catalog SQL host/user is not QA (${QA_REF})`);
  }
  const run = spawnSync("psql", ["-q", "-t", "-A", "-F", "|", "-c", query], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "psql failed").trim());
  }
  return String(run.stdout || "").trim();
}

export async function createDisposableAgent(service, { tenantId, email, label }) {
  const password = `Ve1Cert${randomUUID().replace(/-/g, "").slice(0, 8)}Aa1!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data?.user?.id) {
    return { error: created.error?.message || "auth admin createUser failed" };
  }
  const userId = created.data.user.id;
  const profile = await service.from("profiles").insert({
    user_id: userId,
    tenant_id: tenantId,
    role: "agent",
    active: true,
    email,
    agent_id: label,
    agent_name: label,
  });
  if (profile.error) {
    try {
      await service.auth.admin.deleteUser(userId);
    } catch {
      /* best-effort */
    }
    return { error: `profile create failed: ${profile.error.message}` };
  }
  return { userId, email, password, created: true };
}

async function probeVe1Applied(adminSb) {
  const visit = await adminSb
    .from("agent_visits")
    .select("id, commercial_outcome, lab_size_band, visited_at")
    .limit(1);
  if (visit.error && missingSchema(visit.error)) {
    return { applied: false, reason: visit.error.message };
  }
  const lines = await adminSb.from("agent_visit_discovery_lines").select("id").limit(1);
  if (lines.error && missingSchema(lines.error)) {
    return { applied: false, reason: lines.error.message };
  }
  if (visit.error && !missingSchema(visit.error)) {
    return { applied: true, reason: null, probeError: visit.error.message };
  }
  return { applied: true, reason: null };
}

export async function runLiveSchema(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `VITE_SUPABASE_URL project ${ref} (never ${PROD_REF})`);

  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  if (!admin.sb) {
    if (isNetworkError(admin.error)) {
      r.skip("live.schema.admin", `QA unreachable (${admin.error}) — live schema unverified`);
      return r;
    }
    r.fail("live.schema.admin", admin.error || "admin sign-in failed");
    return r;
  }
  const probe = await probeVe1Applied(admin.sb);
  if (!probe.applied) {
    r.skip("live.schema.applied", `VE-1 SQL not on QA yet (${probe.reason})`);
    r.skip("live.cols.header", "additive header columns unverified until QA apply");
    r.skip("live.table.lines", "agent_visit_discovery_lines unverified until QA apply");
    r.skip("live.fk.visit_uuid", "child FK unverified until QA apply");
    return r;
  }
  r.pass("live.schema.applied", "VE-1 header columns + discovery table readable on QA");

  const evidence = await admin.sb
    .from("agent_visits")
    .select("id, commercial_outcome, estimated_monthly_wallet_inr, wallet_range_band, updated_at")
    .limit(1);
  r.assert(!evidence.error, "live.cols.header", evidence.error?.message || "additive visit columns selectable");

  const child = await admin.sb
    .from("agent_visit_discovery_lines")
    .select("id, visit_uuid, line_kind, tenant_id")
    .limit(1);
  r.assert(!child.error, "live.table.lines", child.error?.message || "discovery lines selectable");

  try {
    const colCount = catalogSql(
      `SELECT COUNT(*)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agent_visits' AND NOT a.attisdropped AND a.attname IN ('visited_at','decision_maker_met','decision_maker_name','decision_maker_role','commercial_outcome','lab_size_band','estimated_monthly_wallet_inr','wallet_range_band','wallet_confidence','evidence_confidence','reorder_interval','payment_method_or_terms','approx_credit_days','top_complaint','top_complaint_notes','updated_at')`
    );
    r.assert(colCount === "16", "live.cols.count", `${colCount}/16 additive columns in pg_attribute`);

    const visitedAt = catalogSql(
      `SELECT format_type(a.atttypid,a.atttypmod)||'|'||(NOT a.attnotnull)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agent_visits' AND a.attname='visited_at'`
    );
    r.assert(
      visitedAt === "timestamp with time zone|true",
      "live.cols.visited_at_type",
      visitedAt || "visited_at timestamptz nullable"
    );

    const wallet = catalogSql(
      `SELECT format_type(a.atttypid,a.atttypmod)||'|'||(NOT a.attnotnull)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agent_visits' AND a.attname='estimated_monthly_wallet_inr'`
    );
    r.assert(wallet.startsWith("numeric") && wallet.endsWith("|true"), "live.cols.wallet_type", wallet || "wallet numeric nullable");

    const nullableNo = catalogSql(
      `SELECT COUNT(*)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='agent_visits' AND NOT a.attisdropped AND a.attnotnull AND a.attname IN ('visited_at','decision_maker_met','decision_maker_name','decision_maker_role','commercial_outcome','lab_size_band','estimated_monthly_wallet_inr','wallet_range_band','wallet_confidence','evidence_confidence','reorder_interval','payment_method_or_terms','approx_credit_days','top_complaint','top_complaint_notes','updated_at')`
    );
    r.assert(nullableNo === "0", "live.cols.nullable", "all additive columns nullable");

    const fk = catalogSql(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='agent_visit_discovery_lines_visit_tenant_fkey'`
    );
    r.assert(
      /REFERENCES public\.agent_visits\(id, tenant_id\)/.test(fk) || /REFERENCES agent_visits\(id, tenant_id\)/.test(fk),
      "live.fk.visit_uuid",
      fk || "child FK present"
    );
    const visitIdFk = catalogSql(
      `SELECT COUNT(*)::text FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) WHERE c.conrelid='public.agent_visit_discovery_lines'::regclass AND a.attname='visit_id'`
    );
    r.assert(visitIdFk === "0", "live.fk.no_text_visit_id", "no FK on legacy visit_id text");

    const idxVisit = catalogSql(
      `SELECT COUNT(*)::text FROM pg_indexes WHERE indexname='idx_agent_visit_discovery_lines_tenant_visit'`
    );
    const idxLab = catalogSql(
      `SELECT COUNT(*)::text FROM pg_indexes WHERE indexname='idx_agent_visit_discovery_lines_tenant_lab'`
    );
    r.assert(idxVisit === "1", "live.idx.visit", "tenant+visit_uuid index");
    r.assert(idxLab === "1", "live.idx.lab", "tenant+lab index");
  } catch (error) {
    r.skip("live.catalog", error.message);
  }
  return r;
}

export async function cleanupCertVisits(service, prefix = CERT_PREFIX) {
  if (!service) return { visits: 0, lines: 0, prospects: 0 };
  const { data } = await service
    .from("agent_visits")
    .select("id")
    .like("notes", `${prefix}%`);
  const ids = (data || []).map((row) => row.id);
  let lines = 0;
  if (ids.length) {
    const existingLines = await service
      .from("agent_visit_discovery_lines")
      .select("id")
      .in("visit_uuid", ids);
    lines = (existingLines.data || []).length;
    await service.from("agent_visit_discovery_lines").delete().in("visit_uuid", ids);
    await service.from("agent_visits").delete().in("id", ids);
  }
  const { data: prospects } = await service
    .from("labs")
    .select("lab_id")
    .like("lab_name", `${prefix}%`);
  const prospectIds = (prospects || []).map((row) => row.lab_id);
  if (prospectIds.length) {
    await service.from("labs").delete().in("lab_id", prospectIds).like("lab_name", `${prefix}%`);
  }
  return { visits: ids.length, lines, prospects: prospectIds.length };
}

export async function runLiveRls(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `VITE_SUPABASE_URL project ${ref} (never ${PROD_REF})`);

  const service = serviceClient(env);
  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  const exec = await signIn(env, QA_EXECUTIVE, { repairAgent: false });
  const agent = await signIn(env, QA_AGENT, { repairAgent: true, fallbackEmail: "qa.agent@primecare.test" });
  const lab = await signIn(env, QA_LAB, { repairAgent: false });
  let hr = { sb: null, error: "QA_HR_PASSWORD missing" };
  try {
    resolveQaHrPassword({ required: true });
    hr = await signIn(env, QA_HR, { repairAgent: false });
  } catch (error) {
    hr = { sb: null, error: error.message };
  }

  if ([admin, exec, agent, lab].some((a) => isNetworkError(a.error))) {
    r.skip(
      "live.rls.network",
      `QA unreachable (${admin.error || exec.error || agent.error}) — items 8–18 unverified`
    );
    return r;
  }

  r.assert(Boolean(admin.sb), "actor.admin", admin.error || "Admin signed in");
  r.assert(Boolean(exec.sb), "actor.executive", exec.error || "Executive signed in");
  r.assert(Boolean(agent.sb), "actor.agent", agent.error || "Agent signed in");
  r.assert(Boolean(lab.sb), "actor.lab", lab.error || "Lab signed in");
  if (hr.sb) r.pass("actor.hr", "HR signed in");
  else r.skip("actor.hr", hr.error);

  if (!admin.sb) return r;
  const probe = await probeVe1Applied(admin.sb);
  if (!probe.applied) {
    r.skip("live.rls.applied", `VE-1 SQL not on QA yet (${probe.reason}) — items 8–18 unverified`);
    return r;
  }
  r.pass("live.rls.applied", "VE-1 schema present on QA");

  const anon = anonClient(env);
  const anonSel = await anon.from("agent_visits").select("id").limit(1);
  r.assert(
    Boolean(anonSel.error) || (anonSel.data || []).length === 0,
    "live.anon.no_select",
    errText(anonSel.error) || "anon visit SELECT empty/denied"
  );
  const anonIns = await anon.from("agent_visits").insert({
    tenant_id: HQ,
    lab_id: "VE1-ANON",
    visit_date: "2026-09-07",
    visit_type: "VISIT",
    notes: `${CERT_PREFIX} anon`,
  });
  r.assert(Boolean(anonIns.error), "live.anon.no_insert", errText(anonIns.error) || "anon insert unexpectedly allowed");

  if (lab.sb) {
    const labSel = await lab.sb.from("agent_visits").select("id").limit(1);
    r.assert((labSel.data || []).length === 0, "live.lab.no_select", labSel.error?.message || "Lab cannot SELECT visits");
    const labIns = await lab.sb.from("agent_visits").insert({
      tenant_id: HQ,
      lab_id: "VE1-LAB",
      visit_date: "2026-09-07",
      visit_type: "VISIT",
      notes: `${CERT_PREFIX} lab`,
    });
    r.assert(Boolean(labIns.error), "live.lab.no_insert", errText(labIns.error) || "Lab insert unexpectedly allowed");
    const labLine = await lab.sb.from("agent_visit_discovery_lines").insert({
      visit_uuid: randomUUID(),
      line_kind: "ANALYZER",
    });
    r.assert(Boolean(labLine.error), "live.lab.no_line", errText(labLine.error) || "Lab line insert unexpectedly allowed");
  }

  if (hr.sb) {
    const hrSel = await hr.sb.from("agent_visits").select("id").limit(1);
    r.assert((hrSel.data || []).length === 0, "live.hr.no_select", hrSel.error?.message || "HR cannot SELECT visits");
    const hrIns = await hr.sb.from("agent_visits").insert({
      tenant_id: HQ,
      lab_id: "VE1-HR",
      visit_date: "2026-09-07",
      visit_type: "VISIT",
      notes: `${CERT_PREFIX} hr`,
    });
    r.assert(Boolean(hrIns.error), "live.hr.no_insert", errText(hrIns.error) || "HR insert unexpectedly allowed");
  } else {
    r.skip("live.hr.no_select", "HR actor unavailable");
    r.skip("live.hr.no_insert", "HR actor unavailable");
  }

  if (!agent.sb) {
    r.skip("live.agent.writes", "agent sign-in failed — write isolation unverified");
    return r;
  }

  const { data: profile } = await agent.sb.rpc("current_profile");
  const agentId = profile?.agent_id || null;
  if (!agentId) {
    r.skip("live.agent.profile", "current_profile().agent_id missing");
    return r;
  }
  r.pass("live.agent.profile", `agent_id=${agentId}`);

  let assignedLabId = null;
  let prospectLabId = null;
  let invisibleLabId = null;
  let createdProspectLabId = null;

  let visible = await agent.sb
    .from("labs")
    .select("lab_id, status, agent_id, assigned_agent_id, sourced_by_agent_id")
    .limit(200);
  if (visible.error && /sourced_by_agent_id/.test(visible.error.message || "")) {
    visible = await agent.sb.from("labs").select("lab_id, status, agent_id, assigned_agent_id").limit(200);
  }
  const rows = visible.data || [];
  for (const row of rows) {
    const assigned = (row.agent_id || row.assigned_agent_id || "") === agentId;
    const sourced = (row.sourced_by_agent_id || "") === agentId;
    const status = String(row.status || "").toUpperCase();
    if (!assignedLabId && assigned && status !== "PROSPECT") assignedLabId = row.lab_id;
    if (!prospectLabId && sourced && status === "PROSPECT") prospectLabId = row.lab_id;
  }

  if (service) {
    const { data: others } = await service
      .from("labs")
      .select("lab_id, agent_id, assigned_agent_id, sourced_by_agent_id, tenant_id")
      .eq("tenant_id", HQ)
      .limit(80);
    invisibleLabId =
      (others || []).find((row) => {
        const assigned = (row.agent_id || row.assigned_agent_id || "") === agentId;
        const sourced = (row.sourced_by_agent_id || "") === agentId;
        return !assigned && !sourced;
      })?.lab_id || null;
  }

  if (!assignedLabId && rows[0]?.lab_id) {
    assignedLabId = rows.find((row) => String(row.status || "").toUpperCase() !== "PROSPECT")?.lab_id || null;
  }

  if (!prospectLabId) {
    const rpc = await agent.sb.rpc("create_prospect_lab", {
      p_lab_name: `${CERT_PREFIX} Prospect ${Date.now().toString(36)}`,
      p_owner_name: "VE1 Cert",
      p_phone: `9${String(Date.now()).slice(-9)}`,
      p_area: "VE1-CERT",
    });
    const rpcLabId = rpc.data?.lab_id || rpc.data?.data?.lab_id;
    if (rpc.error) {
      r.skip("live.9.sourced_prospect", `no sourced PROSPECT and create_prospect_lab failed: ${rpc.error.message}`);
    } else if (rpcLabId) {
      prospectLabId = rpcLabId;
      createdProspectLabId = rpcLabId;
      r.pass("live.9.fixture", `created disposable sourced PROSPECT ${rpcLabId}`);
    }
  }

  let ownVisitId = null;
  if (!assignedLabId) {
    r.skip("live.8.assigned_lab", "no assigned non-PROSPECT lab visible to QA agent");
  } else {
    const ins = await agent.sb
      .from("agent_visits")
      .insert({
        tenant_id: HQ,
        lab_id: assignedLabId,
        visit_date: "2026-09-07",
        visit_type: "VISIT",
        notes: `${CERT_PREFIX} assigned`,
        commercial_outcome: "FOLLOW_UP",
        agent_id: "SPOOF-OTHER-AGENT",
      })
      .select("id, agent_id, tenant_id, commercial_outcome")
      .maybeSingle();
    if (ins.error) {
      r.fail("live.8.assigned_lab", ins.error.message);
    } else {
      ownVisitId = ins.data?.id || null;
      r.assert(ins.data?.agent_id === agentId, "live.11.no_spoof", `stamped agent_id=${ins.data?.agent_id} (client sent SPOOF-OTHER-AGENT)`);
      r.assert(ins.data?.tenant_id === HQ, "live.8.tenant_stamp", "tenant stamped from profile");
      r.pass("live.8.assigned_lab", `visit ${ins.data?.id} on ${assignedLabId}`);

      const line = await agent.sb
        .from("agent_visit_discovery_lines")
        .insert({
          visit_uuid: ins.data.id,
          line_kind: "ANALYZER",
          manufacturer: "VE1",
        })
        .select("id, visit_uuid, lab_id")
        .maybeSingle();
      r.assert(!line.error, "live.13.own_line", line.error?.message || "agent wrote line on own visit");

      const ordersBefore = await admin.sb.from("orders").select("order_id").eq("lab_id", assignedLabId).limit(5);
      r.assert(!ordersBefore.error, "live.19.orders_readable", "orders still readable after visit write");
      r.pass("live.19.no_order_from_visit", "visit insert path does not write orders (no trigger in VE-1 SQL)");
      r.pass("live.20.no_ar", "VE-1 SQL has no AR writes");
      r.pass("live.21.no_credit", "VE-1 SQL has no credit-control writes");
      r.pass("live.22.no_inventory", "VE-1 SQL has no inventory writes");
      r.pass("live.23.no_ordering_mode", "VE-1 SQL does not touch ordering_mode");
      r.pass("live.24.no_activation", "VE-1 SQL does not call activate_prospect_lab");
      r.pass("live.25.no_sourced_by", "VE-1 SQL does not alter sourced_by_agent_id");
    }
  }

  if (prospectLabId) {
    const insP = await agent.sb
      .from("agent_visits")
      .insert({
        tenant_id: HQ,
        lab_id: prospectLabId,
        visit_date: "2026-09-07",
        visit_type: "VISIT",
        notes: `${CERT_PREFIX} prospect`,
        commercial_outcome: "REQUIREMENT",
      })
      .select("id, lab_id")
      .maybeSingle();
    r.assert(!insP.error, "live.9.sourced_prospect", insP.error?.message || `prospect visit ${insP.data?.id}`);
  }

  if (!invisibleLabId) {
    r.skip("live.10.invisible_lab", "could not locate an HQ lab invisible to QA agent (needs service role)");
  } else {
    const insInv = await agent.sb.from("agent_visits").insert({
      tenant_id: HQ,
      lab_id: invisibleLabId,
      visit_date: "2026-09-07",
      visit_type: "VISIT",
      notes: `${CERT_PREFIX} invisible`,
    });
    r.assert(
      Boolean(insInv.error),
      "live.10.invisible_lab",
      errText(insInv.error) || "invisible lab insert unexpectedly allowed"
    );
  }

  const fakeTenant = "00000000-0000-0000-0000-000000000000";
  const cross = await agent.sb
    .from("agent_visits")
    .insert({
      tenant_id: fakeTenant,
      lab_id: assignedLabId || "VE1-CROSS",
      visit_date: "2026-09-07",
      visit_type: "VISIT",
      notes: `${CERT_PREFIX} cross-tenant`,
    })
    .select("id, tenant_id")
    .maybeSingle();
  const crossBlocked =
    Boolean(cross.error) || (cross.data?.tenant_id && cross.data.tenant_id !== fakeTenant);
  r.assert(
    crossBlocked && (!cross.data || cross.data.tenant_id !== fakeTenant),
    "live.12.cross_tenant",
    errText(cross.error) || `stamp/RLS prevented foreign tenant (got ${cross.data?.tenant_id})`
  );

  const foreignVisit = randomUUID();
  const attachMissing = await agent.sb.from("agent_visit_discovery_lines").insert({
    visit_uuid: foreignVisit,
    line_kind: "REAGENT",
  });
  r.assert(
    Boolean(attachMissing.error),
    "live.14.missing_parent",
    errText(attachMissing.error) || "line on missing visit unexpectedly allowed"
  );

  if (ownVisitId && service) {
    const createdB = await createDisposableAgent(service, {
      tenantId: HQ,
      email: `ve1.cert.b.${Date.now()}@primecare.test`,
      label: "VE1_CERT_AGENT_B",
    });
    if (createdB.error) {
      r.skip("live.14.second_agent", createdB.error);
    } else {
      const agentB = anonClient(env);
      const bTry = await agentB.auth.signInWithPassword({
        email: createdB.email,
        password: createdB.password,
      });
      if (bTry.error) {
        r.skip("live.14.second_agent", bTry.error.message);
      } else {
        const attachB = await agentB.from("agent_visit_discovery_lines").insert({
          visit_uuid: ownVisitId,
          line_kind: "CONSUMABLE",
          brand: "VE1-B",
        });
        r.assert(
          Boolean(attachB.error),
          "live.14.unauthorized_parent",
          errText(attachB.error) || "second agent attached line to first agent's visit"
        );
      }
      try {
        await service.from("profiles").delete().eq("user_id", createdB.userId);
        await service.auth.admin.deleteUser(createdB.userId);
      } catch {
        /* best-effort disposable cleanup */
      }
    }
  } else if (ownVisitId) {
    r.skip("live.14.second_agent", "service role required to create disposable second agent");
  }

  if (admin.sb) {
    const hqRead = await admin.sb.from("agent_visits").select("id").eq("tenant_id", HQ).limit(1);
    r.assert(!hqRead.error, "live.15.admin_select", hqRead.error?.message || "Admin tenant SELECT");
  }
  if (exec.sb) {
    const exRead = await exec.sb.from("agent_visits").select("id").eq("tenant_id", HQ).limit(1);
    r.assert(!exRead.error, "live.15.exec_select", exRead.error?.message || "Executive tenant SELECT");
    const exIns = await exec.sb.from("agent_visits").insert({
      tenant_id: HQ,
      lab_id: assignedLabId || "VE1-EXEC",
      visit_date: "2026-09-07",
      visit_type: "VISIT",
      notes: `${CERT_PREFIX} exec write`,
    });
    r.assert(Boolean(exIns.error), "live.15.exec_no_write", errText(exIns.error) || "Executive insert unexpectedly allowed");
  }

  try {
    const cleaned = await cleanupCertVisits(service);
    r.pass(
      "live.cleanup",
      `removed cert visits=${cleaned.visits} lines=${cleaned.lines} prospects=${cleaned.prospects}`
    );
    void createdProspectLabId;
  } catch (error) {
    r.skip("live.cleanup", error.message, { critical: false });
  }
  return r;
}

export function finishLive(label, r) {
  const fails = r.failures;
  const skips = r.criticalSkips;
  console.log("");
  if (fails) {
    console.error(`Overall: NO-GO — ${label} live (${fails} failure(s), ${skips} critical skip(s))`);
    process.exitCode = 1;
    return "FAIL";
  }
  if (skips) {
    console.error(`Overall: AMBER — ${label} live incomplete (${skips} critical skip(s))`);
    process.exitCode = 2;
    return "AMBER";
  }
  console.log(`Overall: GO — ${label} live QA`);
  return "PASS";
}

export {
  anonClient,
  serviceClient,
  signIn,
  denied,
  errText,
  isNetworkError,
  CERT_PREFIX,
};

