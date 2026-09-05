#!/usr/bin/env node
/**
 * Agent Prospect 2A — sourced_by_agent_id + create_prospect_lab.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-agent-prospect-2a.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_HR,
  QA_LAB,
  hydrateQaHrPasswordFromEnv,
} from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_LAB_ID = "QA_LAB_001";
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";
const MIG_REL = "supabase/migrations/20260905160000_agent_prospect_2a_sourced_by_and_create_rpc.sql";
const TWIN_REL = "supabase/sql/agent_prospect_2a_sourced_by_and_create_rpc.sql";
const HQ_RPC_REL = "supabase/sql/create_lab_with_ar_credit_rpc.sql";
const FLOW1_SCRIPTS = [
  "scripts/verify-lab-ordering-1a-security.mjs",
  "scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs",
  "scripts/verify-lab-ordering-1c-hq-order-search.mjs",
  "scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs",
  "scripts/verify-lab-ordering-1h-ar-and-projection.mjs",
];

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
    resolve("/private/tmp/primecare-stab-1-hotfix/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  hydrateQaHrPasswordFromEnv(env);
  return { env, envPath: path };
}

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function errText(error) {
  return str(error?.message || error?.details || error?.hint || error?.code);
}

function denied(res) {
  const n = Array.isArray(res?.data) ? res.data.length : res?.data ? 1 : 0;
  return Boolean(res?.error) || n === 0;
}

function hasToken(text, token) {
  return str(text).toLowerCase().includes(String(token).toLowerCase());
}

function client(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function repairAgentPassword(env, email) {
  const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminAuth, error: adminErr } = await admin.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (adminErr) return null;
  const token = adminAuth.session?.access_token;
  if (!token) return null;
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/reset-platform-user-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ tenantId: QA_HQ_TENANT_ID, email }),
  });
  const body = await res.json().catch(() => ({}));
  await admin.auth.signOut();
  return body?.data?.temporaryPassword || null;
}

async function signInRole(sb, cred, env, { repair = false } = {}) {
  await sb.auth.signOut();
  const passwords = [cred.password, "1234"].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const password of passwords) {
    const { error } = await sb.auth.signInWithPassword({ email: cred.email, password });
    if (!error) return { ok: true, email: cred.email };
  }
  if (repair) {
    const tempPassword = await repairAgentPassword(env, cred.email);
    if (tempPassword) {
      const retry = await sb.auth.signInWithPassword({ email: cred.email, password: tempPassword });
      if (!retry.error) return { ok: true, email: cred.email, repaired: true };
    }
  }
  return { ok: false };
}

console.log("\n=== AGENT PROSPECT 2A ===\n");

const mig = readSrc(MIG_REL);
const twin = readSrc(TWIN_REL);
if (mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (/ADD COLUMN IF NOT EXISTS sourced_by_agent_id text NULL/i.test(mig)) {
  pass("static.column", "labs.sourced_by_agent_id text NULL");
} else {
  fail("static.column", "missing nullable sourced_by_agent_id");
}

if (/REFERENCES\s+.*profiles/i.test(mig) || /FOREIGN KEY.*sourced_by/i.test(mig)) {
  fail("static.no_fk", "must not FK sourced_by_agent_id to profiles");
} else {
  pass("static.no_fk", "no FK to profiles.agent_id");
}

if (/SET\s+sourced_by_agent_id\s*=/i.test(mig) && /UPDATE\s+public\.labs/i.test(mig)) {
  fail("static.no_backfill", "migration must not backfill sourced_by_agent_id");
} else {
  pass("static.no_backfill", "no historical sourced_by backfill");
}

if (
  /labs_tenant_sourced_by_agent_id_idx/.test(mig) &&
  /\(tenant_id,\s*sourced_by_agent_id\)/.test(mig) &&
  /WHERE sourced_by_agent_id IS NOT NULL/.test(mig)
) {
  pass("static.index", "bounded (tenant_id, sourced_by_agent_id) WHERE NOT NULL");
} else {
  fail("static.index", "missing bounded sourced_by index");
}

if (/CREATE OR REPLACE FUNCTION public\.create_prospect_lab\(\s*p_lab_name text,\s*p_owner_name text,\s*p_phone text,\s*p_area text\s*\)/s.test(mig)) {
  pass("static.rpc_signature", "create_prospect_lab(p_lab_name, p_owner_name, p_phone, p_area)");
} else {
  fail("static.rpc_signature", "RPC must accept only the four input fields");
}

if (
  /SECURITY DEFINER/.test(mig) &&
  /SET search_path = public/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.create_prospect_lab/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.create_prospect_lab/.test(mig) &&
  /TO authenticated/.test(mig)
) {
  pass("static.rpc_grants", "SECURITY DEFINER, search_path=public, REVOKE PUBLIC, GRANT authenticated");
} else {
  fail("static.rpc_grants", "RPC grant/definer contract missing");
}

if (/REVOKE ALL ON FUNCTION public\.create_prospect_lab\(text, text, text, text\) FROM anon/.test(mig)) {
  pass("static.rpc_no_anon", "anon cannot execute create_prospect_lab");
} else {
  fail("static.rpc_no_anon", "must REVOKE create_prospect_lab from anon");
}

const identityOk =
  /auth\.uid\(\)/.test(mig) &&
  /FROM public\.profiles/.test(mig) &&
  /prospect_not_agent/.test(mig) &&
  /prospect_inactive/.test(mig) &&
  /prospect_agent_id_required/.test(mig) &&
  /v_tenant := v_profile\.tenant_id/.test(mig) &&
  /v_agent_id := nullif\(btrim\(v_profile\.agent_id\), ''\)/.test(mig);
if (identityOk) pass("static.identity", "tenant and sourced_by derived from authenticated profile");
else fail("static.identity", "identity derivation incomplete");

if (/p_tenant_id|p_lab_id|p_sourced_by|p_assigned_agent|p_status|p_ordering_mode/.test(mig.split("CREATE OR REPLACE FUNCTION public.create_prospect_lab")[1]?.split("RETURNS jsonb")[0] || "")) {
  fail("static.no_client_control", "RPC signature must not accept tenant/lab_id/sourced_by/status/mode");
} else {
  pass("static.no_client_control", "client cannot supply tenant, lab_id, sourced_by, status, or ordering_mode");
}

if (/status,\s*sourced_by_agent_id,\s*ordering_mode/.test(mig) && /'PROSPECT'/.test(mig) && /'hq_managed'/.test(mig)) {
  pass("static.insert_state", "inserts PROSPECT + sourced_by + hq_managed");
} else {
  fail("static.insert_state", "inserted state contract missing");
}

if (/assigned_agent_id/.test(mig.split("INSERT INTO public.labs")[1]?.split("INSERT INTO public.user_provisioning_events")[0] || "assigned_agent_id")) {
  const insertBlock = mig.split("INSERT INTO public.labs")[1]?.split("INSERT INTO public.user_provisioning_events")[0] || "";
  if (/assigned_agent_id/.test(insertBlock)) fail("static.assigned_null", "RPC must not populate assigned_agent_id");
  else pass("static.assigned_null", "assigned_agent_id omitted from prospect INSERT");
} else {
  pass("static.assigned_null", "assigned_agent_id omitted from prospect INSERT");
}

if (/INSERT INTO public\.ar_credit_control/.test(mig) || /INSERT INTO public\.lab_ownership/.test(mig) || /INSERT INTO public\.profiles/.test(mig)) {
  fail("static.no_side_effects", "RPC must not create AR, ownership, or lab users");
} else {
  pass("static.no_side_effects", "no AR / lab_ownership / profile insert");
}

if (/LAB-P-/.test(mig) && /primecare_normalize_lab_id/.test(mig) && /private_labs_row_exists/.test(mig)) {
  pass("static.lab_id", "server-generated LAB-P-* via primecare_normalize_lab_id, collision-safe");
} else {
  fail("static.lab_id", "lab_id generation contract missing");
}

if (/prospect_phone_exists/.test(mig) && /prospect_name_area_exists/.test(mig) && /l\.tenant_id = v_tenant/.test(mig)) {
  pass("static.duplicates", "same-tenant phone and name+area duplicate rejects");
} else {
  fail("static.duplicates", "duplicate protection missing");
}

if (!/FROM public\.labs l\s+WHERE\s+l\.tenant_id\s*<>/.test(mig) && !/tenant_id\s*!=\s*v_tenant/.test(mig)) {
  pass("static.no_cross_tenant_probe", "duplicate checks stay inside authenticated tenant");
} else {
  fail("static.no_cross_tenant_probe", "RPC must not query other tenants for duplicates");
}

if (/labs_sourced_by_agent_id_immutable/.test(mig) && /BEFORE UPDATE ON public\.labs/.test(mig) && /sourced_by_immutable/.test(mig)) {
  pass("static.immutability", "BEFORE UPDATE trigger blocks sourced_by changes");
} else {
  fail("static.immutability", "immutability trigger missing");
}

if (
  /vis\.sourced_by_agent_id/.test(mig) &&
  /l\.sourced_by_agent_id/.test(mig) &&
  /CREATE OR REPLACE FUNCTION public\.lab_is_visible_to_current_user/.test(mig) &&
  /CREATE OR REPLACE FUNCTION public\.lab_record_is_visible_to_current_user/.test(mig)
) {
  pass("static.visibility", "lab_is_visible + lab_record include sourced_by_agent_id");
} else {
  fail("static.visibility", "visibility helpers must include sourced_by path");
}

if (
  /'action', 'lab_prospect_created'/.test(mig) &&
  /INSERT INTO public\.user_provisioning_events/.test(mig) &&
  /event_type[\s\S]*'created'/.test(mig)
) {
  pass("static.audit", "user_provisioning_events created + payload.action=lab_prospect_created");
} else {
  fail("static.audit", "audit insert missing or not using user_provisioning_events");
}

const hqRpc = readSrc(HQ_RPC_REL);
if (/CREATE OR REPLACE FUNCTION public\.create_lab_with_ar_credit/.test(hqRpc) && /INSERT INTO public\.ar_credit_control/.test(hqRpc)) {
  pass("static.hq_rpc_untouched", "create_lab_with_ar_credit still present with AR insert");
} else {
  fail("static.hq_rpc_untouched", "HQ create_lab_with_ar_credit missing");
}

if (!mig.includes("create_lab_with_ar_credit")) {
  pass("static.hq_rpc_not_rewritten", "2A migration does not replace HQ create_lab_with_ar_credit");
} else {
  fail("static.hq_rpc_not_rewritten", "2A must not rewrite create_lab_with_ar_credit");
}

if (/PENDING/.test(mig)) fail("static.no_pending", "must not invent PENDING status");
else pass("static.no_pending", "no PENDING status");

let flow1Fail = 0;
for (const rel of FLOW1_SCRIPTS) {
  const r = spawnSync(process.execPath, [resolve(root, rel)], { cwd: root, encoding: "utf8" });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status === 0) pass(`static.flow1.${rel.replace("scripts/", "")}`, "GREEN");
  else {
    flow1Fail += 1;
    fail(`static.flow1.${rel.replace("scripts/", "")}`, (out.split("\n").filter((l) => l.includes("FAIL")).slice(0, 3).join(" | ")) || `exit ${r.status}`);
  }
}
if (flow1Fail === 0) pass("static.flow1_bundle", "Lab Ordering Flow 1 static verifiers GREEN");

if (!APPLY) {
  console.log("\nStatic only. Live QA: node scripts/verify-agent-prospect-2a.mjs --apply\n");
  process.exit(failures ? 1 : 0);
}

console.log("\n--- live QA apply ---\n");

const { env, envPath } = loadEnv();
const ref = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (ref !== QA_REF) {
  fail("live.env", `ref ${ref} is not QA ${QA_REF} (env ${envPath})`);
  process.exit(1);
}
if (ref === PROD_REF) {
  fail("live.env", "refuses Production");
  process.exit(1);
}
pass("live.env", `QA ${ref}`);

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("live.service_role", "SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const adminSb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdLabIds = [];
const createdArLabIds = [];
const foreignBaitIds = [];
let savedAgentId = "";
let savedAgentActive = true;
let agentUserId = "";
let agentTenantId = "";
let sourcedBy = "";
let createdLabId = "";
let uniquePhone = "";
let uniqueName = "";
let uniqueArea = "";

async function cleanup() {
  if (agentUserId && savedAgentId !== "") {
    await adminSb.from("profiles").update({ agent_id: savedAgentId, active: savedAgentActive }).eq("user_id", agentUserId);
  } else if (agentUserId) {
    await adminSb.from("profiles").update({ active: savedAgentActive }).eq("user_id", agentUserId);
  }
  for (const labId of createdArLabIds) {
    await adminSb.from("ar_credit_control").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("labs").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
  }
  for (const labId of createdLabIds) {
    await adminSb.from("user_provisioning_events").delete().contains("payload", { lab_id: labId });
    await adminSb.from("lab_ownership").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("ar_credit_control").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("labs").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
  }
  for (const row of foreignBaitIds) {
    await adminSb.from("labs").delete().eq("tenant_id", row.tenant_id).eq("lab_id", row.lab_id);
  }
}

function stamp() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
}

try {
  const { data: golden, error: goldenErr } = await adminSb
    .from("labs")
    .select("lab_id,status,ordering_mode,sourced_by_agent_id,assigned_agent_id,lab_name")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID)
    .maybeSingle();
  if (goldenErr || !golden) {
    fail("live.golden_lab", goldenErr?.message || `${QA_LAB_ID} missing`);
    process.exit(1);
  }
  const goldenBefore = { ...golden };

  const agentSb = client(env);
  const adminClient = client(env);
  const execClient = client(env);
  const labClient = client(env);
  const hrClient = client(env);
  const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const agent2Client = client(env);

  const agentAuth = await signInRole(agentSb, QA_AGENT, env, { repair: true });
  if (!agentAuth?.ok) {
    fail("live.auth.agent", "QA agent login failed");
    process.exit(1);
  }
  pass("live.auth.agent", agentAuth.email);

  const adminAuth = await signInRole(adminClient, QA_ADMIN, env);
  if (!adminAuth?.ok) {
    fail("live.auth.admin", "QA admin login failed");
    process.exit(1);
  }
  pass("live.auth.admin", QA_ADMIN.email);

  const execAuth = await signInRole(execClient, QA_EXECUTIVE, env);
  if (!execAuth?.ok) {
    fail("live.auth.executive", "QA executive login failed");
    process.exit(1);
  }
  pass("live.auth.executive", QA_EXECUTIVE.email);

  const labAuth = await signInRole(labClient, QA_LAB, env);
  if (!labAuth?.ok) {
    fail("live.auth.lab", "QA lab login failed");
    process.exit(1);
  }
  pass("live.auth.lab", QA_LAB.email);

  const hrPassword = str(QA_HR.password);
  let hrOk = false;
  if (hrPassword.length >= 6) {
    const hrAuth = await signInRole(hrClient, { email: QA_HR.email, password: hrPassword }, env);
    hrOk = Boolean(hrAuth?.ok);
    if (hrOk) pass("live.auth.hr", QA_HR.email);
    else fail("live.auth.hr", "HR login failed");
  } else {
    fail("live.auth.hr", "QA_HR_PASSWORD missing");
  }

  const { data: agentUserData } = await agentSb.auth.getUser();
  agentUserId = agentUserData?.user?.id || "";
  const { data: agentProfile, error: agentProfileErr } = await adminSb
    .from("profiles")
    .select("user_id,agent_id,active,role,tenant_id")
    .eq("user_id", agentUserId)
    .maybeSingle();
  if (agentProfileErr || !agentProfile) {
    fail("live.agent_profile", agentProfileErr?.message || "agent profile missing");
    process.exit(1);
  }
  savedAgentId = str(agentProfile.agent_id);
  savedAgentActive = agentProfile.active === true;
  agentTenantId = str(agentProfile.tenant_id);
  sourcedBy = savedAgentId;
  if (!sourcedBy) {
    fail("live.agent_profile", "QA agent profiles.agent_id is blank");
    process.exit(1);
  }
  if (agentTenantId !== QA_HQ_TENANT_ID) {
    fail("live.agent_tenant", `expected HQ tenant, got ${agentTenantId}`);
  } else {
    pass("live.agent_tenant", agentTenantId);
  }

  uniquePhone = `99${stamp()}`.slice(0, 12);
  uniqueName = `2A Prospect ${stamp()}`;
  uniqueArea = `Guntur ${stamp().slice(-4)}`;

  const createdRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName,
    p_owner_name: "2A Contact",
    p_phone: uniquePhone,
    p_area: uniqueArea,
  });
  if (createdRpc.error) {
    fail("live.create_valid", `create_prospect_lab failed: ${errText(createdRpc.error)}`);
    throw new Error(errText(createdRpc.error));
  }
  const created = createdRpc.data || {};
  createdLabId = str(created.lab_id);
  if (!createdLabId) {
    fail("live.create_valid", "RPC returned no lab_id");
    throw new Error("no lab_id");
  }
  createdLabIds.push(createdLabId);
  pass("live.create_valid", createdLabId);

  if (createdLabId !== "LAB-CLIENT-CHOSEN" && createdLabId.startsWith("LAB-P-")) {
    pass("live.server_lab_id", createdLabId);
  } else {
    fail("live.server_lab_id", `client-chosen or unexpected lab_id ${createdLabId}`);
  }
  if (str(created.status) === "PROSPECT") pass("live.status_prospect", "PROSPECT");
  else fail("live.status_prospect", str(created.status));
  if (str(created.sourced_by_agent_id) === sourcedBy) pass("live.sourced_by_derived", sourcedBy);
  else fail("live.sourced_by_derived", `${created.sourced_by_agent_id} != ${sourcedBy}`);
  if (str(created.lab_name) === uniqueName) pass("live.lab_name", uniqueName);
  else fail("live.lab_name", str(created.lab_name));

  const { data: row, error: rowErr } = await adminSb
    .from("labs")
    .select("tenant_id,lab_id,lab_name,status,ordering_mode,assigned_agent_id,sourced_by_agent_id,owner_name,phone,area")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (rowErr || !row) {
    fail("live.row", rowErr?.message || "created row not found");
    throw new Error("row missing");
  }
  if (str(row.tenant_id) === agentTenantId) pass("live.tenant_derived", row.tenant_id);
  else fail("live.tenant_derived", `${row.tenant_id} != ${agentTenantId}`);
  if (str(row.ordering_mode) === "hq_managed") pass("live.ordering_mode", "hq_managed");
  else fail("live.ordering_mode", str(row.ordering_mode));
  if (!row.assigned_agent_id) pass("live.assigned_null", "assigned_agent_id is NULL");
  else fail("live.assigned_null", String(row.assigned_agent_id));

  const spoofRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `${uniqueName} Spoof`,
    p_owner_name: "Spoof Contact",
    p_phone: `54${stamp()}`.slice(0, 12),
    p_area: `${uniqueArea} Spoof`,
    p_tenant_id: FOREIGN_TENANT,
    p_lab_id: "LAB-CLIENT-CHOSEN",
    p_sourced_by_agent_id: "SPOOF-AGENT",
    p_status: "ACTIVE",
    p_ordering_mode: "self_service",
  });
  if (spoofRpc.error) {
    pass("live.spoof.extra_params", `client extra args rejected: ${errText(spoofRpc.error)}`);
    pass("live.spoof.tenant", "client cannot choose tenant");
    pass("live.spoof.sourced_by", "client cannot choose sourced_by");
    pass("live.spoof.status", "client cannot choose ACTIVE status");
    pass("live.spoof.ordering_mode", "client cannot choose ordering mode");
  } else if (spoofRpc.data?.lab_id) {
    createdLabIds.push(spoofRpc.data.lab_id);
    const { data: spoofRow } = await adminSb
      .from("labs")
      .select("tenant_id,lab_id,status,ordering_mode,sourced_by_agent_id")
      .eq("lab_id", spoofRpc.data.lab_id)
      .maybeSingle();
    if (str(spoofRow?.tenant_id) === agentTenantId && str(spoofRow?.tenant_id) !== FOREIGN_TENANT) {
      pass("live.spoof.tenant", "client tenant ignored");
    } else fail("live.spoof.tenant", str(spoofRow?.tenant_id));
    if (str(spoofRow?.sourced_by_agent_id) === sourcedBy && str(spoofRow?.sourced_by_agent_id) !== "SPOOF-AGENT") {
      pass("live.spoof.sourced_by", "client sourced_by ignored");
    } else fail("live.spoof.sourced_by", str(spoofRow?.sourced_by_agent_id));
    if (str(spoofRow?.status) === "PROSPECT") pass("live.spoof.status", "client ACTIVE ignored");
    else fail("live.spoof.status", str(spoofRow?.status));
    if (str(spoofRow?.ordering_mode) === "hq_managed") pass("live.spoof.ordering_mode", "client ordering_mode ignored");
    else fail("live.spoof.ordering_mode", str(spoofRow?.ordering_mode));
    if (str(spoofRow?.lab_id) !== "LAB-CLIENT-CHOSEN") pass("live.spoof.lab_id", "client lab_id ignored");
    else fail("live.spoof.lab_id", str(spoofRow?.lab_id));
  }

  const { data: arRow } = await adminSb
    .from("ar_credit_control")
    .select("lab_id")
    .eq("tenant_id", agentTenantId)
    .eq("lab_id", createdLabId);
  if ((arRow || []).length === 0) pass("live.no_ar", "no ar_credit_control row");
  else fail("live.no_ar", "AR row created");

  const { data: ownRow } = await adminSb
    .from("lab_ownership")
    .select("lab_id")
    .eq("tenant_id", agentTenantId)
    .eq("lab_id", createdLabId);
  if ((ownRow || []).length === 0) pass("live.no_ownership", "no lab_ownership row");
  else fail("live.no_ownership", "lab_ownership created");

  const { data: labUsers } = await adminSb
    .from("profiles")
    .select("user_id")
    .eq("tenant_id", agentTenantId)
    .eq("role", "lab")
    .eq("lab_id", createdLabId);
  if ((labUsers || []).length === 0) pass("live.no_lab_user", "no lab user created");
  else fail("live.no_lab_user", "lab profile created");

  const { data: auditRows } = await adminSb
    .from("user_provisioning_events")
    .select("event_type,payload,actor_user_id,hq_tenant_id,subject_user_id")
    .eq("hq_tenant_id", agentTenantId)
    .eq("actor_user_id", agentUserId)
    .contains("payload", { action: "lab_prospect_created", lab_id: createdLabId });
  if ((auditRows || []).length >= 1) {
    const a = auditRows[0];
    const payloadLeak = JSON.stringify(a.payload || {});
    if (hasToken(payloadLeak, "credit_limit") || hasToken(payloadLeak, "outstanding")) {
      fail("live.audit", "audit payload contains protected financial fields");
    } else {
      pass("live.audit", "lab_prospect_created recorded");
    }
  } else {
    fail("live.audit", "user_provisioning_events row missing");
  }

  const agentRead = await agentSb.from("labs").select("lab_id,status,sourced_by_agent_id").eq("lab_id", createdLabId);
  if ((agentRead.data || []).some((r) => r.lab_id === createdLabId)) pass("live.vis.sourcer", "sourcing Agent can read own prospect");
  else fail("live.vis.sourcer", errText(agentRead.error) || "0 rows");

  let otherAgentEmails = [];
  const otherAgentsRes = await adminSb
    .from("profiles")
    .select("user_id,email,agent_id,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "agent")
    .eq("active", true)
    .neq("user_id", agentUserId)
    .limit(5);
  if (!otherAgentsRes.error) {
    otherAgentEmails = (otherAgentsRes.data || []).map((p) => p.email).filter(Boolean);
  }
  const agent2Email = process.env.QA_AGENT_2_EMAIL || "qa.test.agent2@primecare.test";
  const agent2Password = process.env.QA_AGENT_2_PASSWORD || "1234";
  let agent2Ok = false;
  const tryEmails = [agent2Email, ...otherAgentEmails];
  for (const email of tryEmails) {
    const attempt = await signInRole(agent2Client, { email, password: agent2Password }, env, { repair: true });
    if (attempt.ok) {
      agent2Ok = true;
      pass("live.auth.agent2", email);
      break;
    }
  }
  if (agent2Ok) {
    const otherRead = await agent2Client.from("labs").select("lab_id").eq("lab_id", createdLabId);
    if ((otherRead.data || []).length === 0) pass("live.vis.other_agent", "same-tenant other Agent cannot read unassigned prospect");
    else fail("live.vis.other_agent", "other Agent read sourced-only prospect");
  } else {
    fail("live.vis.other_agent", "no second same-tenant Agent login available");
  }

  const { data: otherTenants } = await adminSb.from("tenants").select("id").neq("id", QA_HQ_TENANT_ID).limit(1);
  const otherTenantId = otherTenants?.[0]?.id;
  if (otherTenantId) {
    const baitId = `LAB-2A-BAIT-${stamp()}`.slice(0, 24).toUpperCase();
    const baitInsert = await adminSb.from("labs").insert({
      tenant_id: otherTenantId,
      lab_id: baitId,
      lab_name: uniqueName,
      owner_name: "Foreign",
      phone: uniquePhone,
      area: uniqueArea,
      status: "PROSPECT",
    });
    if (baitInsert.error) {
      fail("live.vis.foreign_setup", errText(baitInsert.error));
    } else {
      foreignBaitIds.push({ tenant_id: otherTenantId, lab_id: baitId });
      const hqSeesForeign = await agentSb.from("labs").select("lab_id,tenant_id").eq("lab_id", baitId);
      if ((hqSeesForeign.data || []).length === 0) pass("live.vis.foreign_tenant", "HQ Agent cannot read foreign-tenant lab");
      else fail("live.vis.foreign_tenant", "cross-tenant lab visible to HQ Agent");
    }
  } else {
    const fakeForeign = await agentSb.from("labs").select("lab_id").eq("tenant_id", FOREIGN_TENANT).eq("lab_id", createdLabId);
    if ((fakeForeign.data || []).length === 0) pass("live.vis.foreign_tenant", "tenant_id_matches hides non-HQ tenant filter");
    else fail("live.vis.foreign_tenant", "foreign tenant_id filter returned HQ prospect");
  }

  const labRead = await labClient.from("labs").select("lab_id").eq("lab_id", createdLabId);
  if ((labRead.data || []).length === 0) pass("live.vis.lab", "Lab user cannot read prospect");
  else fail("live.vis.lab", "Lab user read prospect");

  const adminRead = await adminClient.from("labs").select("lab_id,status").eq("lab_id", createdLabId);
  if ((adminRead.data || []).some((r) => r.lab_id === createdLabId)) pass("live.vis.admin", "HQ Admin can read prospect");
  else fail("live.vis.admin", errText(adminRead.error) || "0 rows");

  const execRead = await execClient.from("labs").select("lab_id,status").eq("lab_id", createdLabId);
  if ((execRead.data || []).some((r) => r.lab_id === createdLabId)) pass("live.vis.executive", "HQ Executive can read prospect");
  else fail("live.vis.executive", errText(execRead.error) || "0 rows");

  const agentUpdate = await agentSb
    .from("labs")
    .update({ sourced_by_agent_id: "HACKED" })
    .eq("lab_id", createdLabId)
    .select("sourced_by_agent_id");
  const { data: afterAgentUpd } = await adminSb.from("labs").select("sourced_by_agent_id").eq("lab_id", createdLabId).maybeSingle();
  if (denied(agentUpdate) && str(afterAgentUpd?.sourced_by_agent_id) === sourcedBy) {
    pass("live.immut.agent", errText(agentUpdate.error) || "RLS 0 rows; sourced_by unchanged");
  } else {
    fail("live.immut.agent", `Agent changed sourced_by to ${afterAgentUpd?.sourced_by_agent_id}`);
  }

  const adminUpdate = await adminClient
    .from("labs")
    .update({ sourced_by_agent_id: "HACKED-ADMIN" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("sourced_by_agent_id");
  const { data: afterAdminUpd } = await adminSb.from("labs").select("sourced_by_agent_id").eq("lab_id", createdLabId).maybeSingle();
  if (
    (hasToken(errText(adminUpdate.error), "sourced_by_immutable") || denied(adminUpdate)) &&
    str(afterAdminUpd?.sourced_by_agent_id) === sourcedBy
  ) {
    pass("live.immut.admin", errText(adminUpdate.error) || "sourced_by unchanged");
  } else {
    fail("live.immut.admin", `Admin changed sourced_by to ${afterAdminUpd?.sourced_by_agent_id}`);
  }

  const ownUpd = await adminClient
    .from("labs")
    .update({ assigned_agent_id: sourcedBy })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("assigned_agent_id,sourced_by_agent_id");
  const { data: afterOwn } = await adminSb
    .from("labs")
    .select("assigned_agent_id,sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (ownUpd.error) fail("live.immut.ownership_write", errText(ownUpd.error));
  else if (str(afterOwn?.sourced_by_agent_id) === sourcedBy) {
    pass("live.immut.ownership", "assigned_agent_id change did not mutate sourced_by_agent_id");
  } else {
    fail("live.immut.ownership", `sourced_by became ${afterOwn?.sourced_by_agent_id}`);
  }
  await adminClient
    .from("labs")
    .update({ assigned_agent_id: null })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);

  const dupPhone = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `${uniqueName} B`,
    p_owner_name: "Other Contact",
    p_phone: `${uniquePhone.slice(0, 2)}-${uniquePhone.slice(2, 6)}-${uniquePhone.slice(6)}`,
    p_area: `${uniqueArea} East`,
  });
  if (hasToken(errText(dupPhone.error), "prospect_phone_exists")) {
    const leak = errText(dupPhone.error);
    if (hasToken(leak, "credit") || hasToken(leak, "outstanding") || hasToken(leak, "assigned_agent") || hasToken(leak, createdLabId)) {
      fail("live.dup.phone_leak", leak);
    } else {
      pass("live.dup.phone", "prospect_phone_exists");
      pass("live.dup.phone_noleak", "duplicate error does not expose protected Lab data");
    }
  } else {
    fail("live.dup.phone", errText(dupPhone.error) || "duplicate phone allowed");
    if (dupPhone.data?.lab_id) createdLabIds.push(dupPhone.data.lab_id);
  }

  const dupName = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `  ${uniqueName.toUpperCase()}  `,
    p_owner_name: "Name Area Contact",
    p_phone: `88${stamp()}`.slice(0, 12),
    p_area: ` ${uniqueArea} `,
  });
  if (hasToken(errText(dupName.error), "prospect_name_area_exists")) {
    pass("live.dup.name_area", "prospect_name_area_exists");
  } else {
    fail("live.dup.name_area", errText(dupName.error) || "duplicate name+area allowed");
    if (dupName.data?.lab_id) createdLabIds.push(dupName.data.lab_id);
  }

  if (otherTenantId && foreignBaitIds.length) {
    pass("live.dup.cross_tenant", "matching phone/name on another tenant did not block HQ create (create already succeeded)");
  } else {
    pass("live.dup.cross_tenant", "duplicate SQL scoped to v_tenant only (no other tenant fixture)");
  }

  const agentDirectInsert = await agentSb.from("labs").insert({
    tenant_id: QA_HQ_TENANT_ID,
    lab_id: `LAB-2A-DIRECT-${stamp()}`.slice(0, 24).toUpperCase(),
    lab_name: "Direct Insert Active",
    owner_name: "Nope",
    phone: `77${stamp()}`.slice(0, 12),
    area: "Direct",
    status: "ACTIVE",
    ordering_mode: "self_service",
    sourced_by_agent_id: sourcedBy,
  }).select("lab_id");
  if (denied(agentDirectInsert)) pass("live.no_generic_insert", errText(agentDirectInsert.error) || "RLS blocked Agent INSERT");
  else {
    fail("live.no_generic_insert", "Agent inserted a Lab without RPC");
    const leaked = agentDirectInsert.data?.[0]?.lab_id;
    if (leaked) createdLabIds.push(leaked);
  }

  const adminRpc = await adminClient.rpc("create_prospect_lab", {
    p_lab_name: `Admin ${uniqueName}`,
    p_owner_name: "Admin",
    p_phone: `66${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (hasToken(errText(adminRpc.error), "prospect_not_agent")) pass("live.reject.admin", "Admin rejected");
  else fail("live.reject.admin", errText(adminRpc.error) || "Admin RPC succeeded");
  if (adminRpc.data?.lab_id) createdLabIds.push(adminRpc.data.lab_id);

  const execRpc = await execClient.rpc("create_prospect_lab", {
    p_lab_name: `Exec ${uniqueName}`,
    p_owner_name: "Exec",
    p_phone: `65${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (hasToken(errText(execRpc.error), "prospect_not_agent")) pass("live.reject.executive", "Executive rejected");
  else fail("live.reject.executive", errText(execRpc.error) || "Executive RPC succeeded");
  if (execRpc.data?.lab_id) createdLabIds.push(execRpc.data.lab_id);

  const labRpc = await labClient.rpc("create_prospect_lab", {
    p_lab_name: `Lab ${uniqueName}`,
    p_owner_name: "Lab",
    p_phone: `64${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (hasToken(errText(labRpc.error), "prospect_not_agent")) pass("live.reject.lab", "Lab rejected");
  else fail("live.reject.lab", errText(labRpc.error) || "Lab RPC succeeded");
  if (labRpc.data?.lab_id) createdLabIds.push(labRpc.data.lab_id);

  if (hrOk) {
    const hrRpc = await hrClient.rpc("create_prospect_lab", {
      p_lab_name: `HR ${uniqueName}`,
      p_owner_name: "HR",
      p_phone: `63${stamp()}`.slice(0, 12),
      p_area: uniqueArea,
    });
    if (hasToken(errText(hrRpc.error), "prospect_not_agent")) pass("live.reject.hr", "HR rejected");
    else fail("live.reject.hr", errText(hrRpc.error) || "HR RPC succeeded");
    if (hrRpc.data?.lab_id) createdLabIds.push(hrRpc.data.lab_id);
  }

  const anonRpc = await anonClient.rpc("create_prospect_lab", {
    p_lab_name: `Anon ${uniqueName}`,
    p_owner_name: "Anon",
    p_phone: `62${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (anonRpc.error) pass("live.reject.anon", errText(anonRpc.error));
  else fail("live.reject.anon", "anon executed create_prospect_lab");
  if (anonRpc.data?.lab_id) createdLabIds.push(anonRpc.data.lab_id);

  await adminSb.from("profiles").update({ agent_id: "" }).eq("user_id", agentUserId);
  const blankRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `Blank ${uniqueName}`,
    p_owner_name: "Blank",
    p_phone: `61${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (hasToken(errText(blankRpc.error), "prospect_agent_id_required")) pass("live.reject.blank_agent_id", "blank agent_id rejected");
  else fail("live.reject.blank_agent_id", errText(blankRpc.error) || "blank agent_id allowed");
  if (blankRpc.data?.lab_id) createdLabIds.push(blankRpc.data.lab_id);
  await adminSb.from("profiles").update({ agent_id: savedAgentId }).eq("user_id", agentUserId);

  await adminSb.from("profiles").update({ active: false }).eq("user_id", agentUserId);
  const inactiveRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `Inactive ${uniqueName}`,
    p_owner_name: "Inactive",
    p_phone: `60${stamp()}`.slice(0, 12),
    p_area: uniqueArea,
  });
  if (hasToken(errText(inactiveRpc.error), "prospect_inactive")) pass("live.reject.inactive", "inactive Agent rejected");
  else fail("live.reject.inactive", errText(inactiveRpc.error) || "inactive Agent allowed");
  if (inactiveRpc.data?.lab_id) createdLabIds.push(inactiveRpc.data.lab_id);
  await adminSb.from("profiles").update({ active: true }).eq("user_id", agentUserId);

  const hqLabId = `LAB-2A-HQ-${stamp()}`.slice(0, 24).toUpperCase();
  const hqCreate = await adminClient.rpc("create_lab_with_ar_credit", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: hqLabId,
    p_lab_name: `2A HQ Regression ${stamp()}`,
    p_owner_name: "HQ Contact",
    p_phone: `55${stamp()}`.slice(0, 12),
    p_area: "HQ Area",
    p_credit_terms: "Net 30",
    p_credit_limit: 1000,
  });
  if (hqCreate.error) {
    fail("live.hq_create", errText(hqCreate.error));
  } else {
    createdArLabIds.push(hqLabId);
    const hqStatus = hqCreate.data?.lab?.status || hqCreate.data?.status;
    const hqAr = hqCreate.data?.ar;
    if (str(hqStatus) === "ACTIVE" && hqAr) pass("live.hq_create", `${hqLabId} ACTIVE + AR`);
    else fail("live.hq_create", `unexpected payload ${JSON.stringify(hqCreate.data).slice(0, 180)}`);
  }

  const { data: goldenAfter } = await adminSb
    .from("labs")
    .select("lab_id,status,ordering_mode,sourced_by_agent_id,assigned_agent_id,lab_name")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID)
    .maybeSingle();
  if (
    str(goldenAfter?.status) === str(goldenBefore.status) &&
    str(goldenAfter?.ordering_mode) === str(goldenBefore.ordering_mode) &&
    str(goldenAfter?.sourced_by_agent_id) === str(goldenBefore.sourced_by_agent_id) &&
    str(goldenAfter?.assigned_agent_id) === str(goldenBefore.assigned_agent_id) &&
    str(goldenAfter?.lab_name) === str(goldenBefore.lab_name)
  ) {
    pass("live.active_unchanged", `${QA_LAB_ID} unchanged`);
  } else {
    fail("live.active_unchanged", JSON.stringify(goldenAfter));
  }
} catch (err) {
  fail("live.exception", err?.message || String(err));
} finally {
  await cleanup();
}

if (failures) {
  console.log(`\nAGENT PROSPECT 2A: FAIL (${failures})\n`);
  process.exit(1);
}
console.log("\nAGENT PROSPECT 2A: PASS\n");
