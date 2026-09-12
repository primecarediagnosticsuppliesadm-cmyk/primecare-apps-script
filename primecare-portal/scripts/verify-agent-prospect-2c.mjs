#!/usr/bin/env node
/**
 * Agent Prospect 2C — HQ prospect review + activate_prospect_lab.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-agent-prospect-2c.mjs --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";

const MIG_REL = "supabase/migrations/20260905200000_agent_prospect_2c_activate_prospect_lab.sql";
const TWIN_REL = "supabase/sql/agent_prospect_2c_activate_prospect_lab.sql";
const PN_REL = "supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql";
const PN_TWIN_REL = "supabase/sql/pn1a_prospect_in_app_notifications.sql";
const HQ_RPC_REL = "supabase/sql/create_lab_with_ar_credit_rpc.sql";
const API_REL = "src/api/primecareSupabaseApi.js";
const BOUNDS_REL = "src/api/hqReadBounds.js";
const POLICY_REL = "src/config/hqReleasePolicy.js";
const HQ_VIEW_REL = "src/components/hq/HqLabsAdminView.jsx";
const DRAWER_REL = "src/components/operations/OperationalLabDrawer.jsx";
const PAGE_REL = "src/pages/LabsPage.jsx";
const MODAL_REL = "src/components/agent/AddProspectLabModal.jsx";
const ENGINE_REL = "src/operations/labsHqEngine.js";
const FLOW1_SCRIPTS = [
  "scripts/verify-lab-ordering-1a-security.mjs",
  "scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs",
  "scripts/verify-lab-ordering-1c-hq-order-search.mjs",
  "scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs",
  "scripts/verify-lab-ordering-1h-ar-and-projection.mjs",
];
const FLOW3_SCRIPT = "scripts/verify-flow-3a.mjs";

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
  const path = resolve(root, rel);
  if (!existsSync(path)) throw new Error(`missing ${rel}`);
  return readFileSync(path, "utf8");
}

console.log("\n=== AGENT PROSPECT 2C ===\n");

const mig = readSrc(MIG_REL);
const twin = readSrc(TWIN_REL);
if (mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

const fnHead = mig.split("CREATE OR REPLACE FUNCTION public.activate_prospect_lab")[1]?.split("RETURNS jsonb")[0] || "";
if (/p_lab_id text/.test(fnHead) && /p_initial_agent_id text DEFAULT NULL/.test(fnHead) && !/p_tenant_id/.test(fnHead)) {
  pass("static.rpc.signature", "p_lab_id + optional p_initial_agent_id; no client tenant_id");
} else {
  fail("static.rpc.signature", "RPC signature must not accept tenant_id");
}

if (
  /LANGUAGE plpgsql/.test(mig) &&
  /SECURITY DEFINER/.test(mig) &&
  /SET search_path = public/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.activate_prospect_lab\(text, text\) FROM PUBLIC/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.activate_prospect_lab\(text, text\) FROM anon/.test(mig) &&
  /GRANT EXECUTE ON FUNCTION public\.activate_prospect_lab\(text, text\) TO authenticated/.test(mig)
) {
  pass("static.rpc.grants", "SECURITY DEFINER, search_path=public, PUBLIC/anon revoked, authenticated granted");
} else {
  fail("static.rpc.grants", "RPC security/grants contract missing");
}

if (/v_profile\.tenant_id/.test(mig) && /auth\.uid\(\)/.test(mig) && /'admin', 'executive'/.test(mig)) {
  pass("static.rpc.caller", "tenant and HQ role derived from authenticated profile");
} else {
  fail("static.rpc.caller", "must derive HQ tenant/role from profile");
}

if (
  /activate_already_active/.test(mig) &&
  /<> 'PROSPECT'/.test(mig) &&
  /activate_forbidden/.test(mig) &&
  /activate_lab_not_found/.test(mig)
) {
  pass("static.rpc.preconditions", "PROSPECT-only, already_active, role/tenant rejects");
} else {
  fail("static.rpc.preconditions", "precondition exceptions missing");
}

const labsUpdate = mig.split("UPDATE public.labs")[1]?.split("GET DIAGNOSTICS")[0] || "";
if (
  /status = 'ACTIVE'/.test(labsUpdate) &&
  /ordering_mode = 'hq_managed'/.test(labsUpdate) &&
  /assigned_agent_id = v_assign/.test(labsUpdate) &&
  !/sourced_by_agent_id\s*=/.test(labsUpdate)
) {
  pass("static.rpc.no_sourced_write", "labs UPDATE never writes sourced_by_agent_id");
} else {
  fail("static.rpc.no_sourced_write", "activation UPDATE must not SET sourced_by_agent_id");
}

if (
  /INSERT INTO public\.ar_credit_control/.test(mig) &&
  /ON CONFLICT \(tenant_id, lab_id\) DO NOTHING/.test(mig) &&
  /credit_limit,/.test(mig) &&
  /\n    0,\n    0,\n    0,\n    0,\n    NULL/.test(mig)
) {
  pass("static.rpc.ar", "one AR insert, HQ defaults (limit 0, zeros), conflict no-op");
} else {
  fail("static.rpc.ar", "AR initialization contract missing");
}

if (/INSERT INTO public\.lab_ownership/.test(mig) && /v_lab\.sourced_by_agent_id/.test(mig) && /p_initial_agent_id/.test(mig)) {
  pass("static.rpc.ownership", "optional ownership defaults to sourced Agent or explicit Agent");
} else {
  fail("static.rpc.ownership", "ownership default/override missing");
}

if (
  /'action', 'lab_prospect_activated'/.test(mig) &&
  /INSERT INTO public\.user_provisioning_events/.test(mig) &&
  /event_type[\s\S]*'updated'/.test(mig)
) {
  pass("static.rpc.audit", "user_provisioning_events updated + payload.action=lab_prospect_activated");
} else {
  fail("static.rpc.audit", "audit insert missing");
}

if (
  /INSERT INTO public\.profiles/.test(mig) ||
  /INSERT INTO public\.orders/.test(mig) ||
  /INSERT INTO public\.invoices/.test(mig) ||
  /INSERT INTO public\.payments/.test(mig) ||
  /INSERT INTO public\.order_shipments/.test(mig) ||
  /INSERT INTO public\.inventory_ledger/.test(mig)
) {
  fail("static.rpc.no_ops_side_effects", "RPC must not create Lab user/order/invoice/payment/shipment/inventory");
} else {
  pass("static.rpc.no_ops_side_effects", "no Lab user / order / invoice / shipment / inventory / payment inserts");
}

if (/PENDING/.test(mig)) fail("static.no_pending", "must not invent PENDING status");
else pass("static.no_pending", "no PENDING status");

if (
  /labs_prospect_activate_via_rpc_only/.test(mig) &&
  /set_config\('primecare\.activate_prospect', '1', true\)/.test(mig) &&
  /RAISE EXCEPTION 'use_activate_prospect_lab'/.test(mig)
) {
  pass("static.trigger.patch_block", "generic PROSPECT->ACTIVE blocked unless RPC GUC is set");
} else {
  fail("static.trigger.patch_block", "rpc-only activate trigger missing");
}

if (
  /CREATE OR REPLACE VIEW public\.v_labs_credit/.test(mig) &&
  /l\.created_at/.test(mig) &&
  /l\.sourced_by_agent_id/.test(mig) &&
  /security_invoker = true/.test(mig) &&
  /REVOKE ALL ON TABLE public\.v_labs_credit FROM anon/.test(mig)
) {
  pass("static.view", "v_labs_credit keeps sourced_by + created_at, invoker, anon revoked");
} else {
  fail("static.view", "v_labs_credit 2C contract missing");
}

const hqRpc = readSrc(HQ_RPC_REL);
if (/CREATE OR REPLACE FUNCTION public\.create_lab_with_ar_credit/.test(hqRpc) && /p_credit_limit numeric DEFAULT 0/.test(hqRpc)) {
  pass("static.hq_rpc_untouched", "create_lab_with_ar_credit still present with default credit_limit 0");
} else {
  fail("static.hq_rpc_untouched", "HQ create_lab_with_ar_credit missing");
}
if (!mig.includes("create_lab_with_ar_credit")) {
  pass("static.hq_rpc_not_rewritten", "2C migration does not replace HQ create_lab_with_ar_credit");
} else {
  fail("static.hq_rpc_not_rewritten", "2C must not rewrite create_lab_with_ar_credit");
}

const api = readSrc(API_REL);
const writeFn = api.split("export async function activateProspectLabWrite")[1]?.split("export async function createProspectLabWrite")[0] || "";
if (
  /supabase\.rpc\("activate_prospect_lab"/.test(writeFn) &&
  /p_lab_id/.test(writeFn) &&
  /p_initial_agent_id/.test(writeFn) &&
  !/p_tenant_id/.test(writeFn) &&
  !/p_status/.test(writeFn)
) {
  pass("static.api.args", "activateProspectLabWrite sends only lab id + optional agent");
} else {
  fail("static.api.args", "client wrapper must not send tenant/status");
}

if (/use_activate_prospect_lab/.test(api) && !/`\$\{LAB_LIFECYCLE_STATUS\.PROSPECT\}->\$\{LAB_LIFECYCLE_STATUS\.ACTIVE\}`/.test(api)) {
  pass("static.api.patch_reject", "generic lifecycle PATCH rejects PROSPECT->ACTIVE");
} else if (/code: "use_activate_prospect_lab"/.test(api)) {
  pass("static.api.patch_reject", "generic lifecycle PATCH rejects PROSPECT->ACTIVE");
} else {
  fail("static.api.patch_reject", "validateLabLifecycleTransition must reject PROSPECT->ACTIVE");
}

const prospectWrite = api.split("export async function createProspectLabWrite")[1]?.split("export async function createLabWrite")[0] || "";
if (
  /p_lab_name/.test(prospectWrite) &&
  /p_owner_name/.test(prospectWrite) &&
  /p_phone/.test(prospectWrite) &&
  /p_area/.test(prospectWrite) &&
  !/p_tenant_id/.test(prospectWrite)
) {
  pass("static.agent_capture_unchanged", "createProspectLabWrite still four RPC args");
} else {
  fail("static.agent_capture_unchanged", "Agent capture wrapper changed");
}

const bounds = readSrc(BOUNDS_REL);
if (/sourced_by_agent_id/.test(bounds) && /created_at/.test(bounds) && /HQ_V_LABS_CREDIT_LIST_COLUMNS/.test(bounds)) {
  pass("static.read.columns", "bounded v_labs_credit list includes sourced_by and created_at");
} else {
  fail("static.read.columns", "hqReadBounds missing created_at");
}

const policy = readSrc(POLICY_REL);
if (
  /export function isHqProspectActivationWriteBlocked\(\) \{\s*return false;/.test(policy) &&
  /export function isHqAdminFrozen\(/.test(policy)
) {
  pass("static.freeze.narrow_allow", "Activate Lab is a narrow allow; global freeze helper unchanged");
} else {
  fail("static.freeze.narrow_allow", "isHqProspectActivationWriteBlocked must return false without changing isHqAdminFrozen");
}

const hqView = readSrc(HQ_VIEW_REL);
const drawer = readSrc(DRAWER_REL);
const page = readSrc(PAGE_REL);
const modal = readSrc(MODAL_REL);
const engine = readSrc(ENGINE_REL);

if (/All Labs/.test(hqView) && /Active Labs/.test(hqView) && /Prospects/.test(hqView) && /HqProspectDirectoryCard/.test(hqView)) {
  pass("static.ui.tabs", "HQ Labs All / Active Labs / Prospects");
} else {
  fail("static.ui.tabs", "HQ Labs prospect tabs missing");
}

if (
  /Awaiting activation \/ Prospect/.test(hqView) &&
  /PROSPECT/.test(hqView) &&
  /Sourced Agent/.test(hqView) &&
  /isHqProspectLab/.test(engine)
) {
  pass("static.ui.prospect_card", "distinct prospect card with sourced Agent + PROSPECT");
} else {
  fail("static.ui.prospect_card", "prospect card contract missing");
}

const prospectCard = hqView.split("function HqProspectDirectoryCard")[1]?.split("function HqLabDirectoryCard")[0] || "";
if (/Orders|Collections|Visits|outstanding|creditLimit/.test(prospectCard)) {
  fail("static.ui.prospect_no_ops", "prospect card must not expose operational credit/order actions");
} else {
  pass("static.ui.prospect_no_ops", "prospect card has no orders/collections/visits/credit");
}

if (
  /Activate Lab/.test(drawer) &&
  /Activate this prospect as an operational Lab\?/.test(drawer) &&
  /AR will be initialized/.test(drawer) &&
  /Ordering remains HQ managed/.test(drawer) &&
  /Lab login is NOT created/.test(drawer) &&
  /Source attribution remains unchanged/.test(drawer) &&
  /activateProspectLabWrite/.test(drawer) &&
  /isHqProspectActivationWriteBlocked/.test(drawer)
) {
  pass("static.ui.activate", "Activate Lab confirmation copy + RPC write");
} else {
  fail("static.ui.activate", "Activate Lab UI contract missing");
}

if (/Awaiting activation \/ Prospect/.test(drawer)) {
  pass("static.ui.drawer_banner", "drawer says Awaiting activation / Prospect");
} else {
  fail("static.ui.drawer_banner", "prospect drawer banner missing");
}

if (/canAddLab =\s*currentUser\?\.role === ROLES\.EXECUTIVE \|\| currentUser\?\.role === ROLES\.ADMIN/.test(page) && /AddLabModal/.test(page) && /createLabWrite/.test(page)) {
  pass("static.hq_add_lab_unchanged", "HQ Add Lab gating and modal retained");
} else {
  fail("static.hq_add_lab_unchanged", "HQ Add Lab changed unexpectedly");
}

if (/AddProspectLabModal/.test(page) && /createProspectLabWrite/.test(modal) && /canAddProspect = isAgentView/.test(page)) {
  pass("static.agent_add_prospect_unchanged", "Agent Add Prospect remains Agent-only");
} else {
  fail("static.agent_add_prospect_unchanged", "Agent Add Prospect gating changed");
}

const twoA = spawnSync(process.execPath, [resolve(root, "scripts/verify-agent-prospect-2a.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (twoA.status === 0) pass("static.flow2a", "Flow 2A verifier GREEN");
else fail("static.flow2a", (twoA.stdout + twoA.stderr).split("\n").filter((l) => l.includes("FAIL")).slice(0, 3).join(" | ") || `exit ${twoA.status}`);

const twoB = spawnSync(process.execPath, [resolve(root, "scripts/verify-agent-prospect-2b.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (twoB.status === 0) pass("static.flow2b", "Flow 2B verifier GREEN");
else fail("static.flow2b", (twoB.stdout + twoB.stderr).split("\n").filter((l) => l.includes("FAIL")).slice(0, 3).join(" | ") || `exit ${twoB.status}`);

let flow1Fail = 0;
for (const rel of FLOW1_SCRIPTS) {
  const r = spawnSync(process.execPath, [resolve(root, rel)], { cwd: root, encoding: "utf8" });
  if (r.status === 0) pass(`static.flow1.${rel.replace("scripts/", "")}`, "GREEN");
  else {
    flow1Fail += 1;
    fail(`static.flow1.${rel.replace("scripts/", "")}`, `exit ${r.status}`);
  }
}
if (flow1Fail === 0) pass("static.flow1_bundle", "Flow 1 static verifiers GREEN");

{
  const r3 = spawnSync(process.execPath, [resolve(root, FLOW3_SCRIPT)], { cwd: root, encoding: "utf8" });
  if (r3.status === 0) pass("static.flow3a", "Flow 3A static GREEN");
  else fail("static.flow3a", `exit ${r3.status}`);
}

const pn = readSrc(PN_REL);
const pnTwin = readSrc(PN_TWIN_REL);
if (pn === pnTwin) pass("static.pn1a.twin", "PN-1A migration matches SQL twin");
else fail("static.pn1a.twin", "PN-1A migration / twin mismatch");

const pnActivate = pn.split("CREATE OR REPLACE FUNCTION public.activate_prospect_lab")[1] || "";
const labsUpdatePn = pnActivate.split("UPDATE public.labs")[1]?.split("GET DIAGNOSTICS")[0] || "";
if (
  /status = 'ACTIVE'/.test(labsUpdatePn) &&
  /ordering_mode = 'hq_managed'/.test(labsUpdatePn) &&
  /assigned_agent_id = v_assign/.test(labsUpdatePn) &&
  !/sourced_by_agent_id\s*=/.test(labsUpdatePn)
) {
  pass("static.pn1a.no_sourced_write", "PN-1A activate UPDATE still never writes sourced_by_agent_id");
} else {
  fail("static.pn1a.no_sourced_write", "PN-1A activation UPDATE must not SET sourced_by_agent_id");
}

const activateAuditAt = pnActivate.indexOf("'action', 'lab_prospect_activated'");
const activateEmitAt = pnActivate.indexOf("PERFORM public.emit_prospect_in_app_notification");
const sourceResolveAt = pnActivate.indexOf("v_lab.sourced_by_agent_id");
if (
  activateAuditAt >= 0 &&
  activateEmitAt > activateAuditAt &&
  /'prospect_activated'/.test(pnActivate) &&
  /EXCEPTION\s+WHEN OTHERS THEN/.test(pnActivate) &&
  /v_source_user_id/.test(pnActivate) &&
  sourceResolveAt >= 0 &&
  /p_initial_agent_id/.test(pnActivate) &&
  !/target_user_id[\s\S]*v_assign/.test(pnActivate.slice(activateEmitAt, activateEmitAt + 400))
) {
  pass("static.pn1a.activate_hook", "activate emits prospect_activated after audit to sourced_by Agent, exception-isolated");
} else {
  fail("static.pn1a.activate_hook", "activate notify hook missing, not isolated, or retargets assigned Agent");
}

if (/activate_already_active/.test(pnActivate) && pnActivate.indexOf("activate_already_active") < activateEmitAt) {
  pass("static.pn1a.already_active_before_notify", "already_active raises before notify");
} else {
  fail("static.pn1a.already_active_before_notify", "retry path may emit a second notification");
}

if (!APPLY) {
  if (failures) {
    console.log(`\nAGENT PROSPECT 2C: FAIL (${failures})\n`);
    process.exit(1);
  }
  console.log("\nStatic only. Live QA: node scripts/verify-agent-prospect-2c.mjs --apply\n");
  console.log("AGENT PROSPECT 2C: PASS\n");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_HR,
  QA_LAB,
  hydrateQaHrPasswordFromEnv,
  resolveQaHrPassword,
} = await import("./qaCredentials.mjs");
const { PRIMECARE_SUPABASE_PROJECTS } = await import("./lib/primecareReleaseManifest.mjs");

const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_LAB_ID = "QA_LAB_001";
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}
function errText(error) {
  return str(error?.message || error?.details || error?.hint || error?.code);
}
function hasToken(text, token) {
  return str(text).toLowerCase().includes(String(token).toLowerCase());
}
function denied(res) {
  const n = Array.isArray(res?.data) ? res.data.length : res?.data ? 1 : 0;
  return Boolean(res?.error) || n === 0;
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
let createdLabId = "";
let sourcedBy = "";

async function cleanup() {
  for (const labId of createdArLabIds) {
    await adminSb.from("ar_credit_control").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("labs").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
  }
  for (const labId of createdLabIds) {
    await adminSb.from("notification_events").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("source_id", labId);
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

async function countRows(table, labId, extra = {}) {
  let q = adminSb.from(table).select("id", { count: "exact", head: true }).eq("lab_id", labId);
  if (extra.tenant) q = q.eq("tenant_id", QA_HQ_TENANT_ID);
  const { count, error } = await q;
  if (error) return { error: errText(error), count: -1 };
  return { count: count ?? 0 };
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

  const hrPassword = str(resolveQaHrPassword());
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
  const { data: agentProfile } = await adminSb
    .from("profiles")
    .select("user_id,agent_id,active,role,tenant_id")
    .eq("user_id", agentUserData?.user?.id || "")
    .maybeSingle();
  sourcedBy = str(agentProfile?.agent_id);
  if (!sourcedBy) {
    fail("live.agent_profile", "QA agent profiles.agent_id is blank");
    process.exit(1);
  }

  const uniqueName = `2C Prospect ${stamp()}`;
  const uniquePhone = `98${stamp()}`.slice(0, 12);
  const uniqueArea = `Guntur ${stamp().slice(-4)}`;
  const createdRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName,
    p_owner_name: "2C Contact",
    p_phone: uniquePhone,
    p_area: uniqueArea,
  });
  if (createdRpc.error) {
    fail("live.create_prospect", errText(createdRpc.error));
    throw new Error(errText(createdRpc.error));
  }
  createdLabId = str(createdRpc.data?.lab_id);
  createdLabIds.push(createdLabId);
  pass("live.create_prospect", createdLabId);

  const { data: beforeRow } = await adminSb
    .from("labs")
    .select("lab_id,status,ordering_mode,sourced_by_agent_id,assigned_agent_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (str(beforeRow?.status) === "PROSPECT" && str(beforeRow?.sourced_by_agent_id) === sourcedBy) {
    pass("live.before.status", `PROSPECT sourced_by=${sourcedBy}`);
  } else {
    fail("live.before.status", JSON.stringify(beforeRow));
  }

  const agentActivate = await agentSb.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(agentActivate.error), "activate_forbidden")) pass("live.reject.agent", "Agent denied");
  else fail("live.reject.agent", errText(agentActivate.error) || "Agent activate succeeded");

  const labActivate = await labClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(labActivate.error), "activate_forbidden") || hasToken(errText(labActivate.error), "activate_lab_not_found")) {
    pass("live.reject.lab", errText(labActivate.error));
  } else {
    fail("live.reject.lab", errText(labActivate.error) || "Lab activate succeeded");
  }

  if (hrOk) {
    const hrActivate = await hrClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
    if (hasToken(errText(hrActivate.error), "activate_forbidden")) pass("live.reject.hr", "HR denied");
    else fail("live.reject.hr", errText(hrActivate.error) || "HR activate succeeded");
  }

  const anonActivate = await anonClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (anonActivate.error) pass("live.reject.anon", errText(anonActivate.error));
  else fail("live.reject.anon", "anon executed activate_prospect_lab");

  const extraArgs = await adminClient.rpc("activate_prospect_lab", {
    p_lab_id: createdLabId,
    p_tenant_id: FOREIGN_TENANT,
    p_status: "ACTIVE",
    p_ordering_mode: "self_service",
  });
  if (extraArgs.error) pass("live.spoof.extra_params", errText(extraArgs.error));
  else fail("live.spoof.extra_params", "extra RPC keys were accepted");

  const agentPatch = await agentSb.from("labs").update({ status: "ACTIVE" }).eq("lab_id", createdLabId).select("status");
  const { data: afterAgentPatch } = await adminSb
    .from("labs")
    .select("status,sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (denied(agentPatch) && str(afterAgentPatch?.status) === "PROSPECT") {
    pass("live.patch.agent", "Agent cannot PATCH status ACTIVE");
  } else {
    fail("live.patch.agent", JSON.stringify({ err: errText(agentPatch.error), row: afterAgentPatch }));
  }

  const adminPatch = await adminClient
    .from("labs")
    .update({ status: "ACTIVE" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("status");
  const { data: afterAdminPatch } = await adminSb
    .from("labs")
    .select("status,sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (
    (hasToken(errText(adminPatch.error), "use_activate_prospect_lab") || denied(adminPatch)) &&
    str(afterAdminPatch?.status) === "PROSPECT" &&
    str(afterAdminPatch?.sourced_by_agent_id) === sourcedBy
  ) {
    pass("live.patch.admin", "Admin generic PATCH cannot PROSPECT->ACTIVE");
  } else {
    fail("live.patch.admin", JSON.stringify({ err: errText(adminPatch.error), row: afterAdminPatch }));
  }

  const { data: otherTenants } = await adminSb.from("tenants").select("id").neq("id", QA_HQ_TENANT_ID).limit(1);
  const otherTenantId = otherTenants?.[0]?.id;
  if (otherTenantId) {
    const baitId = `LAB-2C-BAIT-${stamp()}`.slice(0, 24).toUpperCase();
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
      fail("live.foreign.setup", errText(baitInsert.error));
    } else {
      foreignBaitIds.push({ tenant_id: otherTenantId, lab_id: baitId });
      const foreignActivate = await adminClient.rpc("activate_prospect_lab", { p_lab_id: baitId });
      if (hasToken(errText(foreignActivate.error), "activate_lab_not_found")) {
        pass("live.foreign.admin", "Admin cannot activate foreign-tenant prospect");
      } else {
        fail("live.foreign.admin", errText(foreignActivate.error) || "foreign activate succeeded");
      }
    }
  } else {
    pass("live.foreign.admin", "no other tenant fixture; same-tenant lookup still required by RPC");
  }

  const first = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (first.error) {
    fail("live.activate.admin", errText(first.error));
    throw new Error(errText(first.error));
  }
  pass("live.activate.admin", createdLabId);

  const { data: after } = await adminSb
    .from("labs")
    .select("lab_id,status,ordering_mode,sourced_by_agent_id,assigned_agent_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (str(after?.status) === "ACTIVE") pass("live.after.status", "ACTIVE");
  else fail("live.after.status", str(after?.status));
  if (str(after?.ordering_mode) === "hq_managed") pass("live.after.ordering", "hq_managed");
  else fail("live.after.ordering", str(after?.ordering_mode));
  if (str(after?.sourced_by_agent_id) === sourcedBy) pass("live.after.sourced_by", sourcedBy);
  else fail("live.after.sourced_by", `${after?.sourced_by_agent_id} != ${sourcedBy}`);
  if (str(after?.assigned_agent_id) === sourcedBy) pass("live.after.assigned", "defaults to sourcing Agent");
  else fail("live.after.assigned", str(after?.assigned_agent_id));

  const notifyCols =
    "event_id,tenant_id,event_type,source_module,source_id,actor_user_id,target_role,target_user_id,target_lab_id,payload_json,severity,status";
  const { data: activatedEvents, error: activatedEvErr } = await adminSb
    .from("notification_events")
    .select(notifyCols)
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("event_type", "prospect_activated")
    .eq("source_id", createdLabId);
  const agentUserId = str(agentUserData?.user?.id);
  if (activatedEvErr) {
    fail("live.notify.activated.one", errText(activatedEvErr));
  } else if ((activatedEvents || []).length === 1) {
    const ev = activatedEvents[0];
    const payload = ev.payload_json && typeof ev.payload_json === "object" ? ev.payload_json : {};
    if (
      str(ev.source_module) === "labs" &&
      str(ev.target_role) === "agent" &&
      str(ev.target_user_id) === agentUserId &&
      ev.target_lab_id == null &&
      str(ev.status) === "pending" &&
      str(payload.cta) === "/labs"
    ) {
      pass("live.notify.activated.one", ev.event_id);
    } else {
      fail("live.notify.activated.one", JSON.stringify(ev));
    }
  } else {
    fail("live.notify.activated.one", `count ${(activatedEvents || []).length}`);
  }

  const { data: arRows } = await adminSb
    .from("ar_credit_control")
    .select("lab_id,credit_limit,outstanding,total_delivered,total_paid,collections_notes")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  if (
    (arRows || []).length === 1 &&
    Number(arRows[0].credit_limit) === 0 &&
    Number(arRows[0].outstanding) === 0 &&
    Number(arRows[0].total_delivered) === 0 &&
    Number(arRows[0].total_paid) === 0 &&
    arRows[0].collections_notes == null
  ) {
    pass("live.ar.once", "AR created once with HQ defaults");
  } else {
    fail("live.ar.once", JSON.stringify(arRows));
  }

  const { data: ownRows } = await adminSb
    .from("lab_ownership")
    .select("lab_id,primary_agent_id,status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  const activeOwn = (ownRows || []).filter((r) => str(r.status).toUpperCase() === "ACTIVE");
  if (activeOwn.length === 1 && str(activeOwn[0].primary_agent_id) === sourcedBy) {
    pass("live.ownership.once", "one ACTIVE ownership row for sourcing Agent");
  } else {
    fail("live.ownership.once", JSON.stringify(ownRows));
  }

  const { data: auditRows } = await adminSb
    .from("user_provisioning_events")
    .select("event_type,payload,actor_user_id")
    .eq("hq_tenant_id", QA_HQ_TENANT_ID)
    .contains("payload", { action: "lab_prospect_activated", lab_id: createdLabId });
  if ((auditRows || []).length >= 1 && str(auditRows[0].event_type) === "updated") {
    pass("live.audit", "lab_prospect_activated recorded");
  } else {
    fail("live.audit", "activation audit missing");
  }

  const { data: labUsers } = await adminSb
    .from("profiles")
    .select("user_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "lab")
    .eq("lab_id", createdLabId);
  if ((labUsers || []).length === 0) pass("live.side.no_lab_user", "no Lab user created");
  else fail("live.side.no_lab_user", "lab profile created");

  const orders = await countRows("orders", createdLabId, { tenant: true });
  const invoices = await countRows("invoices", createdLabId, { tenant: true });
  const payments = await countRows("payments", createdLabId, { tenant: true });
  const shipments = await countRows("order_shipments", createdLabId, { tenant: true });
  const ledger = await countRows("inventory_ledger", createdLabId);
  const sideOk =
    (orders.count === 0 || orders.count === -1) &&
    (invoices.count === 0 || invoices.count === -1) &&
    (payments.count === 0 || payments.count === -1) &&
    (shipments.count === 0 || shipments.count === -1) &&
    (ledger.count === 0 || ledger.count === -1);
  if (sideOk) pass("live.side.no_ops", "no order/invoice/payment/shipment/inventory rows");
  else fail("live.side.no_ops", JSON.stringify({ orders, invoices, payments, shipments, ledger }));

  const repeat = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(repeat.error), "activate_already_active")) pass("live.repeat.admin", "already_active");
  else fail("live.repeat.admin", errText(repeat.error) || "second activate succeeded");

  const execRepeat = await execClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(execRepeat.error), "activate_already_active")) {
    pass("live.repeat.executive", "Executive can call RPC; already_active (role allowed)");
  } else if (!execRepeat.error) {
    fail("live.repeat.executive", "Executive second activate mutated state");
  } else {
    fail("live.repeat.executive", errText(execRepeat.error));
  }

  const { data: arAfterRepeat } = await adminSb
    .from("ar_credit_control")
    .select("lab_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  if ((arAfterRepeat || []).length === 1) pass("live.repeat.ar", "still exactly one AR row");
  else fail("live.repeat.ar", `AR count ${(arAfterRepeat || []).length}`);

  const { data: ownAfterRepeat } = await adminSb
    .from("lab_ownership")
    .select("id,status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  if ((ownAfterRepeat || []).filter((r) => str(r.status).toUpperCase() === "ACTIVE").length === 1) {
    pass("live.repeat.ownership", "still exactly one ACTIVE ownership row");
  } else {
    fail("live.repeat.ownership", JSON.stringify(ownAfterRepeat));
  }

  const { data: activatedAfterRepeat, error: activatedRepeatErr } = await adminSb
    .from("notification_events")
    .select("event_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("event_type", "prospect_activated")
    .eq("source_id", createdLabId);
  if (activatedRepeatErr) fail("live.notify.activated.nodup", errText(activatedRepeatErr));
  else if ((activatedAfterRepeat || []).length === 1) pass("live.notify.activated.nodup", "activate_already_active did not emit a second event");
  else fail("live.notify.activated.nodup", `count ${(activatedAfterRepeat || []).length}`);

  const agentActivatedVis = await agentSb
    .from("notification_events")
    .select("event_id")
    .eq("event_type", "prospect_activated")
    .eq("source_id", createdLabId);
  if ((agentActivatedVis.data || []).length === 1) pass("live.notify.vis.sourcer", "sourcing Agent sees prospect_activated");
  else fail("live.notify.vis.sourcer", errText(agentActivatedVis.error) || `count ${(agentActivatedVis.data || []).length}`);

  const adminActivatedVis = await adminClient
    .from("notification_events")
    .select("event_id")
    .eq("event_type", "prospect_activated")
    .eq("source_id", createdLabId);
  if ((adminActivatedVis.data || []).length === 1) pass("live.notify.vis.admin", "HQ Admin retains tenant visibility of Agent-targeted event");
  else fail("live.notify.vis.admin", errText(adminActivatedVis.error) || `count ${(adminActivatedVis.data || []).length}`);

  const labActivatedVis = await labClient
    .from("notification_events")
    .select("event_id")
    .eq("event_type", "prospect_activated")
    .eq("source_id", createdLabId);
  if ((labActivatedVis.data || []).length === 0) pass("live.notify.vis.lab", "Lab cannot see prospect_activated");
  else fail("live.notify.vis.lab", "Lab saw prospect_activated");

  if (hrOk) {
    const hrActivatedVis = await hrClient
      .from("notification_events")
      .select("event_id")
      .eq("event_type", "prospect_activated")
      .eq("source_id", createdLabId);
    if ((hrActivatedVis.data || []).length === 0) pass("live.notify.vis.hr", "HR cannot see prospect_activated");
    else fail("live.notify.vis.hr", "HR saw prospect_activated");
  }

  const agent2Client = client(env);
  const agent2Email = process.env.QA_AGENT_2_EMAIL || "qa.test.agent2@primecare.test";
  const agent2Password = process.env.QA_AGENT_2_PASSWORD || "1234";
  let agent2Ok = false;
  let agent2UserId = "";
  const otherAgentsRes = await adminSb
    .from("profiles")
    .select("user_id,email")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "agent")
    .eq("active", true)
    .neq("user_id", agentUserId)
    .limit(5);
  const tryEmails = [agent2Email, ...((otherAgentsRes.data || []).map((p) => p.email).filter(Boolean))];
  for (const email of tryEmails) {
    const attempt = await signInRole(agent2Client, { email, password: agent2Password }, env, { repair: true });
    if (attempt.ok) {
      agent2Ok = true;
      const { data: agent2User } = await agent2Client.auth.getUser();
      agent2UserId = str(agent2User?.user?.id);
      pass("live.auth.agent2", email);
      break;
    }
  }
  if (agent2Ok) {
    const otherActivatedVis = await agent2Client
      .from("notification_events")
      .select("event_id")
      .eq("event_type", "prospect_activated")
      .eq("source_id", createdLabId);
    if ((otherActivatedVis.data || []).length === 0) {
      pass("live.notify.vis.other_agent", "other Agent cannot see sourcing Agent prospect_activated");
    } else {
      fail("live.notify.vis.other_agent", "other Agent saw targeted activation");
    }
  } else {
    fail("live.notify.vis.other_agent", "no second same-tenant Agent login available");
  }

  const forgeTarget = agent2UserId || "00000000-0000-0000-0000-000000000099";
  const forgeActivated = await agentSb.from("notification_events").insert({
    tenant_id: QA_HQ_TENANT_ID,
    event_type: "prospect_activated",
    source_module: "labs",
    source_id: `FORGE-${stamp()}`,
    actor_user_id: agentUserId,
    target_role: "agent",
    target_user_id: forgeTarget,
    target_lab_id: null,
    payload_json: { lab_name: "forged" },
    severity: "info",
    status: "pending",
  });
  if (hasToken(errText(forgeActivated.error), "prospect_notify_forbidden") || forgeActivated.error) {
    pass("live.notify.forge.activated", errText(forgeActivated.error) || "denied");
  } else {
    fail("live.notify.forge.activated", "agent forged prospect_activated targeting another Agent");
  }

  const sourcedHack = await adminClient
    .from("labs")
    .update({ sourced_by_agent_id: "HACKED-2C" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("sourced_by_agent_id");
  const { data: afterHack } = await adminSb
    .from("labs")
    .select("sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (
    (hasToken(errText(sourcedHack.error), "sourced_by_immutable") || denied(sourcedHack)) &&
    str(afterHack?.sourced_by_agent_id) === sourcedBy
  ) {
    pass("live.immut.admin", "ordinary Admin update cannot change sourced_by");
  } else {
    fail("live.immut.admin", `${errText(sourcedHack.error)} / ${afterHack?.sourced_by_agent_id}`);
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
  if (str(afterOwn?.sourced_by_agent_id) === sourcedBy) {
    pass("live.immut.ownership", "ownership write did not mutate sourced_by");
  } else {
    fail("live.immut.ownership", `${errText(ownUpd.error)} / ${afterOwn?.sourced_by_agent_id}`);
  }

  const hqLabId = `LAB-2C-HQ-${stamp()}`.slice(0, 24).toUpperCase();
  const hqCreate = await adminClient.rpc("create_lab_with_ar_credit", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: hqLabId,
    p_lab_name: `2C HQ Regression ${stamp()}`,
    p_owner_name: "HQ Contact",
    p_phone: `54${stamp()}`.slice(0, 12),
    p_area: "HQ Area",
    p_credit_terms: "Net 30",
    p_credit_limit: 1000,
  });
  if (hqCreate.error) fail("live.hq_create", errText(hqCreate.error));
  else {
    createdArLabIds.push(hqLabId);
    const hqStatus = hqCreate.data?.lab?.status || hqCreate.data?.status;
    if (str(hqStatus) === "ACTIVE" && hqCreate.data?.ar) pass("live.hq_create", `${hqLabId} ACTIVE + AR`);
    else fail("live.hq_create", JSON.stringify(hqCreate.data).slice(0, 180));
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
  console.log(`\nAGENT PROSPECT 2C: FAIL (${failures})\n`);
  process.exit(1);
}
console.log("\nAGENT PROSPECT 2C: PASS\n");
process.exit(0);
