#!/usr/bin/env node
/**
 * Flow 2E — PROSPECT cannot receive orders; PROSPECT ordering_mode stays hq_managed.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-agent-prospect-2e.mjs --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";

const MIG_REL = "supabase/migrations/20260906080000_flow2e_prospect_order_and_ordering_mode_invariants.sql";
const TWIN_REL = "supabase/sql/agent_prospect_2e_prospect_order_and_ordering_mode_invariants.sql";
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
  failures += 1;
  console.error(`FAIL  ${id}: ${detail}`);
}
function str(v) {
  return v == null ? "" : String(v);
}

function readRel(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

console.log("\n=== Agent Prospect 2E — cross-flow hardening ===\n");

const mig = readRel(MIG_REL);
const twin = readRel(TWIN_REL);

if (mig && twin && mig === twin) pass("static.twin", `${MIG_REL} matches SQL twin`);
else fail("static.twin", "migration/twin missing or diverge");

if (!/UPDATE\s+public\.inventory|UPDATE\s+inventory\b/i.test(mig)) {
  pass("static.no_inventory_update", "2E does not deduct inventory");
} else {
  fail("static.no_inventory_update", "inventory UPDATE found in 2E migration");
}

if (!/INSERT\s+INTO\s+public\.ar_credit_control/i.test(mig) && !/INSERT\s+INTO\s+public\.payments/i.test(mig)) {
  pass("static.no_finance_mutation", "2E does not insert AR/payments");
} else {
  fail("static.no_finance_mutation", "unexpected AR/payment insert in 2E");
}

const statusBlock = mig.split("SELECT l.status INTO v_lab_status")[1] || "";
const beforeLabGate = statusBlock.split("IF v_role = 'lab' THEN")[0] || "";
if (
  /IS DISTINCT FROM 'ACTIVE'/.test(beforeLabGate) &&
  /RAISE EXCEPTION 'lab_inactive'/.test(beforeLabGate) &&
  !/IF v_role = 'lab' THEN[\s\S]*lab_inactive/.test(beforeLabGate)
) {
  pass("static.rpc.active_all_callers", "lab_inactive is outside the Lab-only branch");
} else {
  fail("static.rpc.active_all_callers", "ACTIVE check is still Lab-only or missing");
}

if (
  /IF v_role = 'lab' THEN[\s\S]*lab_ordering_allows_lab_initiate[\s\S]*lab_ordering_blocked/.test(statusBlock)
) {
  pass("static.rpc.lab_ordering_mode", "Lab self-initiate ordering_mode gate retained");
} else {
  fail("static.rpc.lab_ordering_mode", "lab_ordering_allows_lab_initiate missing after ACTIVE check");
}

if (
  /CREATE POLICY orders_insert_by_role/.test(mig) &&
  /can_write_ops_for_tenant\(tenant_id\)[\s\S]*lab_row_is_active\(tenant_id, lab_id\)/.test(mig)
) {
  pass("static.rls.hq_insert_active", "HQ orders INSERT requires lab_row_is_active");
} else {
  fail("static.rls.hq_insert_active", "orders_insert_by_role HQ path missing lab_row_is_active");
}

if (
  /CREATE OR REPLACE FUNCTION public\.labs_prospect_ordering_hq_managed/.test(mig) &&
  /RAISE EXCEPTION 'prospect_ordering_hq_managed'/.test(mig) &&
  /OLD\.status[\s\S]*PROSPECT[\s\S]*NEW\.status[\s\S]*PROSPECT/.test(mig) &&
  /CREATE TRIGGER labs_prospect_ordering_hq_managed_trg/.test(mig)
) {
  pass("static.trigger.prospect_hq_managed", "PROSPECT remaining-row ordering_mode lock present");
} else {
  fail("static.trigger.prospect_hq_managed", "prospect ordering_mode trigger missing");
}

if (!/CREATE OR REPLACE FUNCTION public\.activate_prospect_lab/.test(mig)) {
  pass("static.activate_untouched", "2E does not rewrite activate_prospect_lab");
} else {
  fail("static.activate_untouched", "2E must not replace activate_prospect_lab");
}

if (!/CREATE OR REPLACE FUNCTION public\.create_prospect_lab/.test(mig)) {
  pass("static.create_prospect_untouched", "2E does not rewrite create_prospect_lab");
} else {
  fail("static.create_prospect_untouched", "2E must not replace create_prospect_lab");
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

const twoC = spawnSync(process.execPath, [resolve(root, "scripts/verify-agent-prospect-2c.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (twoC.status === 0) pass("static.flow2c", "Flow 2C verifier GREEN");
else fail("static.flow2c", (twoC.stdout + twoC.stderr).split("\n").filter((l) => l.includes("FAIL")).slice(0, 3).join(" | ") || `exit ${twoC.status}`);

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

if (!APPLY) {
  if (failures) {
    console.log(`\nAGENT PROSPECT 2E: FAIL (${failures})\n`);
    process.exit(1);
  }
  console.log("\nStatic only. Live QA: node scripts/verify-agent-prospect-2e.mjs --apply\n");
  console.log("AGENT PROSPECT 2E: PASS\n");
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
} = await import("./qaCredentials.mjs");
const { PRIMECARE_SUPABASE_PROJECTS } = await import("./lib/primecareReleaseManifest.mjs");

const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_LAB_ID = "QA_LAB_001";

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
const createdOrderIds = [];
let createdLabId = "";
let sourcedBy = "";

async function cleanupOrders() {
  for (const orderId of createdOrderIds) {
    await adminSb.from("order_items").delete().eq("order_id", orderId);
    await adminSb.from("order_shipments").delete().eq("order_id", orderId);
    await adminSb.from("invoices").delete().eq("order_id", orderId);
    await adminSb.from("orders").delete().eq("order_id", orderId);
  }
}

async function cleanup() {
  await cleanupOrders();
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
}

function stamp() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
}

async function countRows(table, labId) {
  const { count, error } = await adminSb
    .from(table)
    .select("lab_id", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", labId);
  if (error) return { error: errText(error), count: -1 };
  return { count: count ?? 0 };
}

async function snapshotOps(labId) {
  const orders = await countRows("orders", labId);
  const invoices = await countRows("invoices", labId);
  const payments = await countRows("payments", labId);
  const shipments = await countRows("order_shipments", labId);
  const { data: orderIds } = await adminSb
    .from("orders")
    .select("order_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", labId);
  const ids = (orderIds || []).map((r) => r.order_id);
  let items = 0;
  if (ids.length) {
    const itemRes = await adminSb
      .from("order_items")
      .select("order_item_id", { count: "exact", head: true })
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .in("order_id", ids);
    items = itemRes.error ? -1 : itemRes.count ?? 0;
  }
  const { data: ar } = await adminSb
    .from("ar_credit_control")
    .select("outstanding,total_delivered,total_paid")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", labId);
  return {
    orders: orders.count,
    invoices: invoices.count,
    payments: payments.count,
    shipments: shipments.count,
    items,
    arCount: (ar || []).length,
    outstanding: Number(ar?.[0]?.outstanding ?? 0),
    delivered: Number(ar?.[0]?.total_delivered ?? 0),
    paid: Number(ar?.[0]?.total_paid ?? 0),
  };
}

function opsUnchanged(before, after) {
  return (
    before.orders === after.orders &&
    before.invoices === after.invoices &&
    before.payments === after.payments &&
    before.shipments === after.shipments &&
    before.items === after.items &&
    before.arCount === after.arCount &&
    before.outstanding === after.outstanding &&
    before.delivered === after.delivered &&
    before.paid === after.paid
  );
}

async function catalogProduct() {
  const { data, error } = await adminSb
    .from("products")
    .select("product_id,selling_price")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("active", true)
    .gt("selling_price", 0)
    .limit(25);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const inv = await adminSb
      .from("inventory")
      .select("product_id,current_stock")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("product_id", row.product_id)
      .gt("current_stock", 0)
      .maybeSingle();
    if (inv.data?.product_id) {
      return { ...row, current_stock: Number(inv.data.current_stock) };
    }
  }
  return null;
}

async function readStock(productId) {
  const { data } = await adminSb
    .from("inventory")
    .select("current_stock")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("product_id", productId)
    .maybeSingle();
  return Number(data?.current_stock ?? NaN);
}

function orderRpcArgs(labId, product, tag) {
  const oid = `ORD-2E-${tag}-${stamp()}`.slice(0, 40);
  return {
    args: {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_lab_id: labId,
      p_order_id: oid,
      p_items: [{ product_id: product.product_id, quantity: 1 }],
      p_client_request_id: `CRQ-${oid}`,
      p_status: "Placed",
      p_created_by: tag,
    },
    orderId: oid,
  };
}

async function assertProspectUnchanged(label) {
  const { data } = await adminSb
    .from("labs")
    .select("status,ordering_mode,sourced_by_agent_id,assigned_agent_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (str(data?.status) === "PROSPECT" && str(data?.ordering_mode) === "hq_managed") {
    pass(label, "status=PROSPECT ordering_mode=hq_managed");
    return data;
  }
  fail(label, JSON.stringify(data));
  return data;
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

  const product = await catalogProduct();
  if (!product) {
    fail("live.fixture.product", "no active in-stock product");
    process.exit(1);
  }
  pass("live.fixture.product", `${product.product_id} stock=${product.current_stock}`);
  const stockBefore = await readStock(product.product_id);

  const agentSb = client(env);
  const adminClient = client(env);
  const execClient = client(env);
  const labClient = client(env);
  const hrClient = client(env);

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

  const uniqueName = `2E Prospect ${stamp()}`;
  const uniquePhone = `98${stamp()}`.slice(0, 12);
  const uniqueArea = `Guntur ${stamp().slice(-4)}`;
  const createdRpc = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName,
    p_owner_name: "2E Contact",
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
  if (
    str(beforeRow?.status) === "PROSPECT" &&
    str(beforeRow?.ordering_mode) === "hq_managed" &&
    str(beforeRow?.sourced_by_agent_id) === sourcedBy &&
    !str(beforeRow?.assigned_agent_id)
  ) {
    pass("live.create.contract", "PROSPECT hq_managed sourced_by set assigned NULL");
  } else {
    fail("live.create.contract", JSON.stringify(beforeRow));
  }

  const { data: arAtCreate } = await adminSb
    .from("ar_credit_control")
    .select("lab_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  const { data: ownAtCreate } = await adminSb
    .from("lab_ownership")
    .select("lab_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  const { data: labUsersAtCreate } = await adminSb
    .from("profiles")
    .select("user_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "lab")
    .eq("lab_id", createdLabId);
  if ((arAtCreate || []).length === 0) pass("live.create.no_ar", "no AR at capture");
  else fail("live.create.no_ar", JSON.stringify(arAtCreate));
  if ((ownAtCreate || []).length === 0) pass("live.create.no_ownership", "no ownership at capture");
  else fail("live.create.no_ownership", JSON.stringify(ownAtCreate));
  if ((labUsersAtCreate || []).length === 0) pass("live.create.no_lab_user", "no Lab user at capture");
  else fail("live.create.no_lab_user", "lab profile created");

  const agentSee = await agentSb
    .from("labs")
    .select("lab_id,status,sourced_by_agent_id")
    .eq("lab_id", createdLabId)
    .maybeSingle();
  if (str(agentSee.data?.lab_id) === createdLabId) pass("live.visibility.agent", "sourcing Agent can see prospect");
  else fail("live.visibility.agent", errText(agentSee.error) || "not visible");

  const opsBeforeAttack = await snapshotOps(createdLabId);

  const adminOrder = orderRpcArgs(createdLabId, product, "ADM");
  const adminRpc = await adminClient.rpc("create_lab_order", adminOrder.args);
  if (hasToken(errText(adminRpc.error), "lab_inactive")) pass("live.attack.admin_order", "Admin → lab_inactive");
  else fail("live.attack.admin_order", errText(adminRpc.error) || JSON.stringify(adminRpc.data));

  const execOrder = orderRpcArgs(createdLabId, product, "EXE");
  const execRpc = await execClient.rpc("create_lab_order", execOrder.args);
  if (hasToken(errText(execRpc.error), "lab_inactive")) pass("live.attack.exec_order", "Executive → lab_inactive");
  else fail("live.attack.exec_order", errText(execRpc.error) || JSON.stringify(execRpc.data));

  const labOrder = orderRpcArgs(createdLabId, product, "LAB");
  const labRpc = await labClient.rpc("create_lab_order", labOrder.args);
  if (hasToken(errText(labRpc.error), "forbidden") || hasToken(errText(labRpc.error), "lab_inactive")) {
    pass("live.attack.lab_order", errText(labRpc.error));
  } else {
    fail("live.attack.lab_order", errText(labRpc.error) || JSON.stringify(labRpc.data));
  }

  const agentOrder = orderRpcArgs(createdLabId, product, "AGT");
  const agentRpc = await agentSb.rpc("create_lab_order", agentOrder.args);
  if (agentRpc.error) pass("live.attack.agent_order", errText(agentRpc.error));
  else fail("live.attack.agent_order", "Agent create_lab_order succeeded");

  const opsAfterOrderAttack = await snapshotOps(createdLabId);
  if (opsUnchanged(opsBeforeAttack, opsAfterOrderAttack) && opsAfterOrderAttack.orders === 0) {
    pass("live.attack.order_side_effects", "no order/item/invoice/shipment/payment/AR mutation");
  } else {
    fail("live.attack.order_side_effects", JSON.stringify({ before: opsBeforeAttack, after: opsAfterOrderAttack }));
  }
  await assertProspectUnchanged("live.attack.order_row");

  const adminMode = await adminClient
    .from("labs")
    .update({ ordering_mode: "hybrid" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("ordering_mode");
  if (hasToken(errText(adminMode.error), "prospect_ordering_hq_managed")) {
    pass("live.attack.admin_mode", "Admin hybrid → prospect_ordering_hq_managed");
  } else {
    fail("live.attack.admin_mode", errText(adminMode.error) || JSON.stringify(adminMode.data));
  }

  const execMode = await execClient
    .from("labs")
    .update({ ordering_mode: "self_service" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("ordering_mode");
  if (hasToken(errText(execMode.error), "prospect_ordering_hq_managed")) {
    pass("live.attack.exec_mode", "Executive self_service → prospect_ordering_hq_managed");
  } else {
    fail("live.attack.exec_mode", errText(execMode.error) || JSON.stringify(execMode.data));
  }

  const agentMode = await agentSb.from("labs").update({ ordering_mode: "hybrid" }).eq("lab_id", createdLabId).select("ordering_mode");
  const labMode = await labClient.from("labs").update({ ordering_mode: "hybrid" }).eq("lab_id", createdLabId).select("ordering_mode");
  if (denied(agentMode)) pass("live.attack.agent_mode", "Agent ordering_mode write denied");
  else fail("live.attack.agent_mode", JSON.stringify(agentMode.data));
  if (denied(labMode)) pass("live.attack.lab_mode", "Lab ordering_mode write denied");
  else fail("live.attack.lab_mode", JSON.stringify(labMode.data));
  if (hrOk) {
    const hrMode = await hrClient.from("labs").update({ ordering_mode: "hybrid" }).eq("lab_id", createdLabId).select("ordering_mode");
    if (denied(hrMode)) pass("live.attack.hr_mode", "HR ordering_mode write denied");
    else fail("live.attack.hr_mode", JSON.stringify(hrMode.data));
  }
  await assertProspectUnchanged("live.attack.mode_row");

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

  const agentActivate = await agentSb.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(agentActivate.error), "activate_forbidden")) pass("live.reject.agent", "Agent activate denied");
  else fail("live.reject.agent", errText(agentActivate.error) || "Agent activate succeeded");

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

  const { data: arRows } = await adminSb
    .from("ar_credit_control")
    .select("lab_id,credit_limit,outstanding,total_delivered,total_paid")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId);
  if (
    (arRows || []).length === 1 &&
    Number(arRows[0].credit_limit) === 0 &&
    Number(arRows[0].outstanding) === 0
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

  const repeat = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(repeat.error), "activate_already_active")) pass("live.repeat.admin", "already_active");
  else fail("live.repeat.admin", errText(repeat.error) || "second activate succeeded");

  const sourcedHack = await adminClient
    .from("labs")
    .update({ sourced_by_agent_id: "HACKED-2E" })
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

  const activeMode = await adminClient
    .from("labs")
    .update({ ordering_mode: "hybrid" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", createdLabId)
    .select("ordering_mode")
    .maybeSingle();
  if (str(activeMode.data?.ordering_mode) === "hybrid") {
    pass("live.active.mode_change", "ACTIVE HQ hybrid allowed");
    await adminClient
      .from("labs")
      .update({ ordering_mode: "hq_managed" })
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("lab_id", createdLabId);
  } else {
    fail("live.active.mode_change", errText(activeMode.error) || JSON.stringify(activeMode.data));
  }

  const hqLabId = `LAB-2E-HQ-${stamp()}`.slice(0, 24).toUpperCase();
  const hqCreate = await adminClient.rpc("create_lab_with_ar_credit", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: hqLabId,
    p_lab_name: `2E HQ Regression ${stamp()}`,
    p_owner_name: "HQ Contact",
    p_phone: `54${stamp()}`.slice(0, 12),
    p_area: "HQ Area",
    p_credit_terms: "Net 30",
    p_credit_limit: 0,
  });
  if (hqCreate.error) fail("live.hq_create", errText(hqCreate.error));
  else {
    createdArLabIds.push(hqLabId);
    const hqStatus = hqCreate.data?.lab?.status || hqCreate.data?.status;
    if (str(hqStatus) === "ACTIVE") pass("live.hq_create", `${hqLabId} ACTIVE`);
    else fail("live.hq_create", JSON.stringify(hqCreate.data).slice(0, 180));
  }

  const opsBeforeActiveOrder = await snapshotOps(hqLabId);
  const activeOrder = orderRpcArgs(hqLabId, product, "ACT");
  const activeRpc = await adminClient.rpc("create_lab_order", activeOrder.args);
  if (activeRpc.error) {
    fail("live.active.order", errText(activeRpc.error));
  } else {
    createdOrderIds.push(activeOrder.orderId);
    const { data: placed } = await adminSb
      .from("orders")
      .select("order_id,lab_id,status,inventory_updated")
      .eq("order_id", activeOrder.orderId)
      .maybeSingle();
    if (str(placed?.lab_id) === hqLabId && str(placed?.status)) {
      pass("live.active.order", `${activeOrder.orderId} ${placed.status}`);
    } else {
      fail("live.active.order", JSON.stringify(placed));
    }
    if (placed?.inventory_updated === true) {
      fail("live.active.inventory_flag", "PLACE unexpectedly marked inventory_updated");
    } else {
      pass("live.active.inventory_flag", "PLACE did not deduct inventory");
    }
  }
  const stockAfter = await readStock(product.product_id);
  if (stockAfter === stockBefore) pass("live.active.stock", `stock unchanged ${stockAfter}`);
  else fail("live.active.stock", `${stockBefore} -> ${stockAfter}`);

  const opsAfterActiveOrder = await snapshotOps(hqLabId);
  if (opsAfterActiveOrder.arCount === opsBeforeActiveOrder.arCount && opsAfterActiveOrder.outstanding === opsBeforeActiveOrder.outstanding) {
    pass("live.active.ar_unchanged", "AR outstanding unchanged on PLACE");
  } else {
    fail("live.active.ar_unchanged", JSON.stringify({ before: opsBeforeActiveOrder, after: opsAfterActiveOrder }));
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
  console.log(`\nAGENT PROSPECT 2E: FAIL (${failures})\n`);
  process.exit(1);
}
console.log("\nAGENT PROSPECT 2E: PASS\n");
process.exit(0);
