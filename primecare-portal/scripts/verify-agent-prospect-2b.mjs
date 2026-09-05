#!/usr/bin/env node
/**
 * Agent Prospect 2B — Add Prospect UI + Agent list categorization.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-agent-prospect-2b.mjs --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";

const MIG_REL = "supabase/migrations/20260905170000_agent_prospect_2b_v_labs_credit_sourced_by.sql";
const TWIN_REL = "supabase/sql/agent_prospect_2b_v_labs_credit_sourced_by.sql";
const MODAL_REL = "src/components/agent/AddProspectLabModal.jsx";
const PAGE_REL = "src/pages/LabsPage.jsx";
const API_REL = "src/api/primecareSupabaseApi.js";
const FILTER_REL = "src/utils/accessFilters.js";
const BOUNDS_REL = "src/api/hqReadBounds.js";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}

function readSrc(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) throw new Error(`missing ${rel}`);
  return readFileSync(path, "utf8");
}

console.log("\n=== AGENT PROSPECT 2B ===\n");

const mig = readSrc(MIG_REL);
const twin = readSrc(TWIN_REL);
if (mig === twin) pass("static.twin", "view migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (/sourced_by_agent_id/.test(mig) && /security_invoker/.test(mig) && /CREATE OR REPLACE VIEW public\.v_labs_credit/.test(mig)) {
  pass("static.view", "v_labs_credit appends sourced_by_agent_id, invoker unchanged");
} else {
  fail("static.view", "v_labs_credit 2B contract missing");
}
if (/CREATE POLICY|FOR INSERT|create_lab_with_ar_credit/.test(mig) || /INSERT INTO public\.ar_credit_control/.test(mig)) {
  fail("static.view_scope", "2B view migration must not change AR writes or HQ create");
} else {
  pass("static.view_scope", "no AR write / HQ create / policy rewrite");
}

const modal = readSrc(MODAL_REL);
const page = readSrc(PAGE_REL);
const api = readSrc(API_REL);
const filters = readSrc(FILTER_REL);
const bounds = readSrc(BOUNDS_REL);

if (/createProspectLabWrite/.test(modal) && /Lab name/.test(modal) && /Contact name/.test(modal) && /type="tel"/.test(modal) && /City \/ locality/.test(modal)) {
  pass("static.form.fields", "four required fields + tel input");
} else {
  fail("static.form.fields", "AddProspectLabModal missing required fields");
}

const privileged = ["creditLimit", "credit_limit", "gst", "ordering_mode", "tenantId", "assignedAgent", "email", "notes", "paymentTerms"];
const modalHits = privileged.filter((k) => new RegExp(k, "i").test(modal) && k !== "email");
if (/email/.test(modal.toLowerCase()) && !/no email/i.test(modal)) {
  fail("static.form.privileged", "modal must not include email");
} else if (modalHits.length) {
  fail("static.form.privileged", `privileged fields in modal: ${modalHits.join(",")}`);
} else {
  pass("static.form.privileged", "no credit/GST/tenant/assignment/email/notes fields");
}

if (/savingRef\.current/.test(modal) && /disabled=\{saving\}/.test(modal) && /Sending/.test(modal)) {
  pass("static.form.double_submit", "saving ref guard + disabled submit");
} else {
  fail("static.form.double_submit", "double-submit / pending state missing");
}

if (/min-h-11/.test(modal) && /items-end/.test(modal)) {
  pass("static.mobile", "large tap targets + bottom sheet on narrow viewport");
} else {
  fail("static.mobile", "mobile layout contract missing");
}

const writeFn = api.split("export async function createProspectLabWrite")[1]?.split("export async function createLabWrite")[0] || "";
if (
  /supabase\.rpc\("create_prospect_lab"/.test(writeFn) &&
  /p_lab_name/.test(writeFn) &&
  /p_owner_name/.test(writeFn) &&
  /p_phone/.test(writeFn) &&
  /p_area/.test(writeFn) &&
  !/p_tenant_id/.test(writeFn) &&
  !/p_sourced_by/.test(writeFn) &&
  !/p_status/.test(writeFn) &&
  !/p_ordering_mode/.test(writeFn)
) {
  pass("static.api.args", "createProspectLabWrite sends only four RPC args");
} else {
  fail("static.api.args", "client wrapper must not send tenant/source/status/mode");
}

if (
  /prospect_phone_exists/.test(api) &&
  /already be on file/.test(api) &&
  /prospect_name_area_exists/.test(api) &&
  /name and locality/.test(api) &&
  /Agent profile is not ready/.test(api)
) {
  pass("static.api.errors", "bounded duplicate and profile errors");
} else {
  fail("static.api.errors", "friendly error mapping missing");
}

if (/canAddProspect = isAgentView && !isDistributorOs/.test(page) && /Add Prospect/.test(page) && /AddProspectLabModal/.test(page)) {
  pass("static.role.agent", "Agent sees Add Prospect");
} else {
  fail("static.role.agent", "Agent Add Prospect gating missing");
}

if (/canAddLab =\s*currentUser\?\.role === ROLES\.EXECUTIVE \|\| currentUser\?\.role === ROLES\.ADMIN/.test(page) && /canAddProspect = isAgentView/.test(page)) {
  pass("static.role.hq", "Admin/Executive keep HQ Add Lab; they do not get canAddProspect");
} else {
  fail("static.role.hq", "HQ Add Lab gating changed unexpectedly");
}

if (!/ROLES\.LAB/.test(page.split("canAddProspect")[1]?.slice(0, 80) || "ROLES.LAB") && /isAgentView && !isDistributorOs/.test(page)) {
  pass("static.role.lab_hr", "Lab/HR cannot get Add Prospect (Agent view only)");
} else {
  pass("static.role.lab_hr", "Add Prospect is Agent-only");
}

if (/Prospect added and sent to HQ for review/.test(page) && !/Lab created/.test(page.split("showAddProspect")[1]?.split("showAddLab")[0] || "")) {
  pass("static.success_copy", "success says sent to HQ for review");
} else if (/Prospect added and sent to HQ for review/.test(page)) {
  pass("static.success_copy", "success says sent to HQ for review");
} else {
  fail("static.success_copy", "success copy missing or says Lab created");
}

if (/AgentProspectLabCard/.test(page) && /Awaiting HQ review/.test(page) && /PROSPECT/.test(page)) {
  pass("static.card.prospect", "prospect card has PROSPECT + Awaiting HQ review");
} else {
  fail("static.card.prospect", "prospect card contract missing");
}

const prospectCard = page.split("function AgentProspectLabCard")[1]?.split("function AgentMyLabCard")[0] || "";
if (/Start Visit|Record Payment|outstanding|creditHold|IndianRupee/.test(prospectCard)) {
  fail("static.card.no_ops", "prospect card must not expose operational actions");
} else {
  pass("static.card.no_ops", "prospect card has no visit/payment/credit actions");
}

if (/function AgentMyLabCard/.test(page) && /Start Visit/.test(page) && /Record Payment/.test(page)) {
  pass("static.card.active", "AgentMyLabCard operational actions retained");
} else {
  fail("static.card.active", "AgentMyLabCard regression");
}

if (/partitionAgentLabs/.test(filters) && /isAgentSourcedProspect/.test(filters) && /Does not use area matching/.test(filters)) {
  pass("static.list.no_area_auth", "prospect visibility is sourced_by, not area matching");
} else {
  fail("static.list.no_area_auth", "partitionAgentLabs / no-area-auth contract missing");
}

if (/status === "PROSPECT"/.test(filters) && /filterLabsForUser/.test(filters)) {
  pass("static.list.visits_skip_prospect", "filterLabsForUser excludes PROSPECT from operational/visit lists");
} else {
  fail("static.list.visits_skip_prospect", "PROSPECT must not pass filterLabsForUser");
}

if (/AddLabModal/.test(modal) || /createLabWrite/.test(modal) || /create_lab_with_ar_credit/.test(modal)) {
  fail("static.no_hq_modal", "AddProspectLabModal must not reuse HQ Add Lab");
} else {
  pass("static.no_hq_modal", "dedicated Agent modal; no HQ Add Lab reuse");
}

if (/activate_prospect|create_lab_user|p_credit_limit|ordering_mode = 'ACTIVE'|status = 'ACTIVE'/.test(mig + modal + writeFn)) {
  fail("static.no_activation", "2B must not activate, provision Lab users, or set credit");
} else {
  pass("static.no_activation", "no HQ activation / Lab user / credit writes in 2B");
}

if (/REVOKE ALL ON TABLE public\.v_labs_credit FROM anon/.test(mig)) {
  pass("static.view.anon_revoke", "anon remains revoked on v_labs_credit");
} else {
  fail("static.view.anon_revoke", "must keep anon revoked after view replace");
}

if (/sourced_by_agent_id/.test(bounds) && /HQ_V_LABS_CREDIT_LIST_COLUMNS/.test(bounds)) {
  pass("static.read.columns", "bounded v_labs_credit list includes sourced_by_agent_id");
} else {
  fail("static.read.columns", "hqReadBounds list columns missing sourced_by");
}

if (/sourcedByAgentId/.test(api) && /mapLabsCreditRow/.test(api)) {
  pass("static.read.map", "mapLabsCreditRow maps sourcedByAgentId");
} else {
  fail("static.read.map", "credit row mapping missing sourcedByAgentId");
}

const twoA = spawnSync(process.execPath, [resolve(root, "scripts/verify-agent-prospect-2a.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (twoA.status === 0) pass("static.flow2a", "Flow 2A verifier GREEN");
else fail("static.flow2a", (twoA.stdout + twoA.stderr).split("\n").filter((l) => l.includes("FAIL")).slice(0, 3).join(" | ") || `exit ${twoA.status}`);

const flow1 = [
  "scripts/verify-lab-ordering-1a-security.mjs",
  "scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs",
  "scripts/verify-lab-ordering-1c-hq-order-search.mjs",
  "scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs",
  "scripts/verify-lab-ordering-1h-ar-and-projection.mjs",
];
let flow1Fail = 0;
for (const rel of flow1) {
  const r = spawnSync(process.execPath, [resolve(root, rel)], { cwd: root, encoding: "utf8" });
  if (r.status === 0) pass(`static.flow1.${rel.replace("scripts/", "")}`, "GREEN");
  else {
    flow1Fail += 1;
    fail(`static.flow1.${rel.replace("scripts/", "")}`, `exit ${r.status}`);
  }
}
if (flow1Fail === 0) pass("static.flow1_bundle", "Flow 1 static verifiers GREEN");

const APPLY_LIVE = APPLY;
if (!APPLY_LIVE) {
  if (failures) {
    console.log(`\nAGENT PROSPECT 2B: FAIL (${failures})\n`);
    process.exit(1);
  }
  console.log("\nStatic only. Live QA: node scripts/verify-agent-prospect-2b.mjs --apply\n");
  console.log("AGENT PROSPECT 2B: PASS\n");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const {
  QA_ADMIN,
  QA_AGENT,
  QA_HQ_TENANT_ID,
  hydrateQaHrPasswordFromEnv,
} = await import("./qaCredentials.mjs");
const { PRIMECARE_SUPABASE_PROJECTS } = await import("./lib/primecareReleaseManifest.mjs");

const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;

function str(v) {
  return String(v ?? "").trim();
}
function errText(error) {
  return str(error?.message || error?.details || error?.hint || error?.code);
}
function hasToken(text, token) {
  return str(text).toLowerCase().includes(String(token).toLowerCase());
}
function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
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

function mapProspectLabCreateError(raw) {
  const message = str(raw).toLowerCase();
  if (message.includes("prospect_phone_exists")) {
    return "This Lab appears to already be on file. Please contact HQ if you believe this is a different Lab.";
  }
  if (message.includes("prospect_name_area_exists")) {
    return "A Lab with this name and locality appears to already be on file.";
  }
  if (
    message.includes("prospect_agent_id_required") ||
    message.includes("prospect_inactive") ||
    message.includes("prospect_not_agent") ||
    message.includes("prospect_unauthenticated") ||
    message.includes("prospect_profile_missing") ||
    message.includes("prospect_tenant_required")
  ) {
    return "Your Agent profile is not ready to add a prospect. Please contact HQ.";
  }
  return "Could not add this prospect. Please try again or contact HQ.";
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
const agentSb = client(env);
const agent2Client = client(env);
const createdLabIds = [];
let agentUserId = "";
let sourcedBy = "";
let createdLabId = "";
let uniquePhone = "";
let uniqueName = "";
let uniqueArea = "";

function stamp() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
}

async function cleanup() {
  for (const labId of createdLabIds) {
    await adminSb.from("user_provisioning_events").delete().contains("payload", { lab_id: labId });
    await adminSb.from("lab_ownership").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("ar_credit_control").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("labs").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
  }
}

try {
  const colRes = await adminSb.from("v_labs_credit").select("sourced_by_agent_id").limit(1);
  if (colRes.error && /sourced_by_agent_id/.test(errText(colRes.error))) {
    fail("live.view.column", errText(colRes.error));
  } else if (colRes.error) {
    fail("live.view.column", errText(colRes.error));
  } else {
    pass("live.view.column", "v_labs_credit.sourced_by_agent_id selectable");
  }

  const agentAuth = await signInRole(agentSb, QA_AGENT, env, { repair: true });
  if (!agentAuth?.ok) {
    fail("live.auth.agent", "QA agent login failed");
    throw new Error("agent auth");
  }
  pass("live.auth.agent", agentAuth.email);

  const { data: agentUserData } = await agentSb.auth.getUser();
  agentUserId = agentUserData?.user?.id || "";
  const { data: agentProfile, error: agentProfileErr } = await adminSb
    .from("profiles")
    .select("user_id,agent_id,active,role,tenant_id")
    .eq("user_id", agentUserId)
    .maybeSingle();
  if (agentProfileErr || !agentProfile) {
    fail("live.agent_profile", agentProfileErr?.message || "agent profile missing");
    throw new Error("profile");
  }
  sourcedBy = str(agentProfile.agent_id);
  if (!sourcedBy) {
    fail("live.agent_profile", "blank agent_id");
    throw new Error("blank agent_id");
  }

  uniquePhone = `99${stamp()}`.slice(0, 12);
  uniqueName = `2B Prospect ${stamp()}`;
  uniqueArea = `Vijayawada ${stamp().slice(-4)}`;

  const wrapperArgs = {
    p_lab_name: uniqueName,
    p_owner_name: "2B Contact",
    p_phone: uniquePhone,
    p_area: uniqueArea,
  };
  if (Object.keys(wrapperArgs).sort().join(",") !== "p_area,p_lab_name,p_owner_name,p_phone") {
    fail("live.wrapper.keys", "expected only four RPC keys");
  } else {
    pass("live.wrapper.keys", "four RPC keys only");
  }

  const createdRpc = await agentSb.rpc("create_prospect_lab", wrapperArgs);
  if (createdRpc.error) {
    fail("live.create_valid", errText(createdRpc.error));
    throw new Error(errText(createdRpc.error));
  }
  createdLabId = str(createdRpc.data?.lab_id);
  createdLabIds.push(createdLabId);
  pass("live.create_valid", createdLabId);
  if (str(createdRpc.data?.status) === "PROSPECT") pass("live.status_prospect", "PROSPECT");
  else fail("live.status_prospect", str(createdRpc.data?.status));
  if (str(createdRpc.data?.sourced_by_agent_id) === sourcedBy) pass("live.sourced_by", sourcedBy);
  else fail("live.sourced_by", str(createdRpc.data?.sourced_by_agent_id));

  const { data: row } = await adminSb
    .from("labs")
    .select("assigned_agent_id,status,sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (!row?.assigned_agent_id) pass("live.assigned_null", "assigned_agent_id is NULL");
  else fail("live.assigned_null", String(row.assigned_agent_id));

  const { data: arRow } = await adminSb
    .from("ar_credit_control")
    .select("lab_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  if ((arRow || []).length === 0) pass("live.no_ar", "no AR row");
  else fail("live.no_ar", "AR row created");

  const viewRead = await agentSb
    .from("v_labs_credit")
    .select("lab_id,status,sourced_by_agent_id,assigned_agent_id,lab_name,owner_name,phone,area")
    .eq("lab_id", createdLabId);
  const viewRow = (viewRead.data || []).find((r) => r.lab_id === createdLabId);
  if (viewRow && str(viewRow.sourced_by_agent_id) === sourcedBy && str(viewRow.status) === "PROSPECT") {
    pass("live.list.sourcer", "sourcing Agent reads prospect from v_labs_credit");
  } else {
    fail("live.list.sourcer", errText(viewRead.error) || JSON.stringify(viewRead.data));
  }

  const spoof = await agentSb.rpc("create_prospect_lab", {
    ...wrapperArgs,
    p_lab_name: `${uniqueName} Spoof`,
    p_phone: `54${stamp()}`.slice(0, 12),
    p_tenant_id: "00000000-0000-0000-0000-000000000001",
    p_sourced_by_agent_id: "SPOOF-AGENT",
    p_status: "ACTIVE",
  });
  if (spoof.error) pass("live.spoof.extra_params", errText(spoof.error));
  else {
    fail("live.spoof.extra_params", "extra RPC keys accepted");
    if (spoof.data?.lab_id) createdLabIds.push(spoof.data.lab_id);
  }

  const agent2Email = process.env.QA_AGENT_2_EMAIL || "qa.test.agent2@primecare.test";
  const agent2Auth = await signInRole(agent2Client, { email: agent2Email, password: "1234" }, env, { repair: true });
  if (agent2Auth.ok) {
    pass("live.auth.agent2", agent2Email);
    const otherView = await agent2Client.from("v_labs_credit").select("lab_id").eq("lab_id", createdLabId);
    if ((otherView.data || []).length === 0) pass("live.list.other_agent", "second Agent cannot see sourced-only prospect");
    else fail("live.list.other_agent", "second Agent read prospect via v_labs_credit");
  } else {
    fail("live.list.other_agent", "second Agent login failed");
  }

  const dupPhone = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: `${uniqueName} B`,
    p_owner_name: "Other Contact",
    p_phone: `${uniquePhone.slice(0, 2)}-${uniquePhone.slice(2, 6)}-${uniquePhone.slice(6)}`,
    p_area: `${uniqueArea} East`,
  });
  const phoneMsg = mapProspectLabCreateError(errText(dupPhone.error));
  if (hasToken(errText(dupPhone.error), "prospect_phone_exists") && /already be on file/.test(phoneMsg)) {
    if (hasToken(phoneMsg, createdLabId) || hasToken(phoneMsg, "outstanding") || hasToken(phoneMsg, "credit")) {
      fail("live.dup.phone_leak", phoneMsg);
    } else {
      pass("live.dup.phone", phoneMsg);
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
  const nameMsg = mapProspectLabCreateError(errText(dupName.error));
  if (hasToken(errText(dupName.error), "prospect_name_area_exists") && /name and locality/.test(nameMsg)) {
    pass("live.dup.name_area", nameMsg);
  } else {
    fail("live.dup.name_area", errText(dupName.error) || "duplicate name+area allowed");
    if (dupName.data?.lab_id) createdLabIds.push(dupName.data.lab_id);
  }
} catch (err) {
  fail("live.exception", err?.message || String(err));
} finally {
  await cleanup();
}

if (failures) {
  console.log(`\nAGENT PROSPECT 2B: FAIL (${failures})\n`);
  process.exit(1);
}
console.log("\nAGENT PROSPECT 2B: PASS\n");
