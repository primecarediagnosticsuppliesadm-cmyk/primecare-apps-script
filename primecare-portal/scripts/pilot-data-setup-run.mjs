#!/usr/bin/env node
/**
 * One-shot pilot data setup — uses existing Supabase tables/RPCs (no new features).
 * Usage: node scripts/pilot-data-setup-run.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";
const DIST = "787999b9-72f5-4163-a860-551c12ce3414";
const GOLDEN_LAB = "QA_LAB_001";
const TARGET_LABS = 25;
const TARGET_AGENTS = 5;

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function labKey(tenantId, labId) {
  return `${str(tenantId).toLowerCase()}::${str(labId).toLowerCase()}`;
}

async function loginAdmin(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Admin auth failed: ${error.message}`);
  return sb;
}

async function createLab(sb, { labId, labName, tenantId, primaryAgentId, agentName }) {
  const row = {
    tenant_id: tenantId,
    lab_id: labId,
    lab_name: labName,
    owner_name: "Pilot Contact",
    phone: "9876500000",
    area: "Guntur",
    credit_terms: "Net 30",
    status: "ACTIVE",
  };
  const { error: labErr } = await sb.from("labs").insert([row]);
  if (labErr) return { ok: false, error: labErr.message };

  const { error: arErr } = await sb.from("ar_credit_control").insert([
    {
      tenant_id: tenantId,
      lab_id: labId,
      lab_name: labName,
      credit_limit: 50000,
      outstanding: 0,
      total_delivered: 0,
      total_paid: 0,
      collections_notes: `contact_email:${labId.toLowerCase()}@pilot.test`,
    },
  ]);
  if (arErr) {
    await sb.from("labs").delete().eq("tenant_id", tenantId).eq("lab_id", labId);
    return { ok: false, error: arErr.message };
  }

  if (primaryAgentId) {
    const own = await assignOwnership(sb, {
      hqTenantId: HQ,
      labTenantId: tenantId,
      labId,
      primaryAgentId,
      agentName,
      labName,
    });
    if (!own.ok) return { ok: false, error: own.error };
  }
  return { ok: true, labId, tenantId };
}

async function assignOwnership(
  sb,
  { hqTenantId, labTenantId, labId, primaryAgentId, agentName, labName }
) {
  const { error } = await sb.rpc("assign_lab_ownership", {
    p_tenant_id: hqTenantId,
    p_lab_tenant_id: labTenantId,
    p_lab_id: labId,
    p_primary_agent_id: primaryAgentId,
    p_secondary_agent_id: null,
    p_manager_id: null,
    p_assigned_by: null,
  });
  if (error) return { ok: false, error: error.message };

  await sb
    .from("labs")
    .update({
      assigned_agent_id: primaryAgentId,
      agent_id: primaryAgentId,
    })
    .eq("tenant_id", labTenantId)
    .eq("lab_id", labId);

  return { ok: true };
}

async function ensureLabs(sb, agents) {
  const { data: existing } = await sb.from("labs").select("lab_id,lab_name,tenant_id,assigned_agent_id,agent_id");
  const labs = existing || [];
  const need = Math.max(0, TARGET_LABS - labs.length);
  console.log(`Labs: ${labs.length} existing, creating ${need} more`);

  const agentIds = agents.slice(0, TARGET_AGENTS).map((a) => a.agent_id);
  let created = 0;
  for (let i = 0; i < need; i++) {
    const n = labs.length + created + 1;
    const labId = `PILOT_LAB_${String(n).padStart(3, "0")}`;
    const agentId = agentIds[(n - 1) % agentIds.length];
    const agent = agents.find((a) => a.agent_id === agentId);
    const res = await createLab(sb, {
      labId,
      labName: `Pilot Lab ${n}`,
      tenantId: DIST,
      primaryAgentId: agentId,
      agentName: agent?.display_name || agentId,
    });
    if (!res.ok) {
      console.warn(`  skip ${labId}: ${res.error}`);
      continue;
    }
    created += 1;
    console.log(`  created ${labId} → ${agentId}`);
  }

  const { data: allLabs } = await sb.from("labs").select("lab_id,lab_name,tenant_id,assigned_agent_id,agent_id");
  return allLabs || [];
}

async function ensureOwnership(sb, allLabs, agents) {
  const agentIds = agents.slice(0, TARGET_AGENTS).map((a) => a.agent_id);
  let assigned = 0;
  for (let i = 0; i < allLabs.length; i++) {
    const lab = allLabs[i];
    const labId = str(lab.lab_id);
    const tenantId = str(lab.tenant_id);
    const agentId =
      str(lab.assigned_agent_id || lab.agent_id) ||
      agentIds[i % agentIds.length];
    const agent = agents.find((a) => a.agent_id === agentId);
    const res = await assignOwnership(sb, {
      hqTenantId: HQ,
      labTenantId: tenantId,
      labId,
      primaryAgentId: agentId,
      agentName: agent?.display_name || agentId,
      labName: lab.lab_name,
    });
    if (res.ok) assigned += 1;
    else console.warn(`  ownership fail ${labId}: ${res.error}`);
  }
  console.log(`Ownership RPC applied for ${assigned}/${allLabs.length} labs`);
}

async function goldenPath(sb, agents) {
  console.log("\n=== Golden path: QA_LAB_001 ===");
  const labTenant = HQ;
  const ownerAgent = agents.find((a) => str(a.agent_id) === "QA_TEST_AGENT2") || agents[0];
  const agentKey = str(ownerAgent?.agent_id || "QA_TEST_AGENT2");

  await sb
    .from("lab_qualifications")
    .update({
      pipeline_stage: "won",
      pipeline_stage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", labTenant)
    .eq("lab_id", GOLDEN_LAB);

  const contractId = `contract-golden-${Date.now().toString(36)}`;
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  await sb.from("lab_contracts").upsert(
    {
      id: contractId,
      contract_number: `CNT-GOLDEN-001`,
      distributor_id: labTenant,
      registry_tenant_id: HQ,
      lab_id: GOLDEN_LAB,
      lab_name: "QA Alpha Diagnostics",
      contract_type: "L1A Consumables",
      status: "Active",
      start_date: today,
      end_date: end.toISOString().slice(0, 10),
      auto_renewal: true,
      payment_terms: "30 Days",
      credit_limit: 50000,
      monthly_commitment: 10000,
      collection_target_pct: 80,
      distributor_margin_pct: 10,
      primecare_margin_pct: 5,
      metadata: { golden_path: true },
    },
    { onConflict: "id" }
  );
  console.log("  qualification → won, contract → Active");

  const { data: inv } = await sb
    .from("inventory")
    .select("product_id,product_name,current_stock,tenant_id")
    .eq("tenant_id", labTenant)
    .gt("current_stock", 0)
    .limit(1);
  const sku = inv?.[0];
  if (!sku) throw new Error("No in-stock SKU for golden order");

  const orderId = `ORD-GOLDEN-${Date.now().toString(36)}`;
  const qty = 2;
  const unitPrice = 500;
  const total = qty * unitPrice;

  const { error: ordErr } = await sb.from("orders").insert([
    {
      order_id: orderId,
      tenant_id: labTenant,
      lab_id: GOLDEN_LAB,
      order_date: today,
      status: "Placed",
      total_amount: total,
      created_by: "pilot-golden-path",
      created_at: new Date().toISOString(),
    },
  ]);
  if (ordErr) throw new Error(`order insert: ${ordErr.message}`);

  await sb.from("order_items").insert([
    {
      order_id: orderId,
      tenant_id: labTenant,
      product_id: sku.product_id,
      product_name: sku.product_name,
      quantity: qty,
      unit_price: unitPrice,
      total_price: total,
    },
  ]);

  const { error: fulfillErr } = await sb
    .from("orders")
    .update({ status: "Fulfilled", updated_at: new Date().toISOString() })
    .eq("order_id", orderId);
  if (fulfillErr) console.warn("  fulfill update:", fulfillErr.message);
  else console.log(`  order ${orderId} → Fulfilled`);

  const paymentId = `PAY-GOLDEN-${Date.now().toString(36)}`;
  const { error: payErr } = await sb.from("payments").insert([
    {
      payment_id: paymentId,
      tenant_id: labTenant,
      lab_id: GOLDEN_LAB,
      order_id: orderId,
      amount: total,
      payment_mode: "Cash",
      payment_date: today,
      created_at: new Date().toISOString(),
    },
  ]);
  if (payErr) console.warn("  payment:", payErr.message);
  else console.log(`  payment ${paymentId} recorded`);

  const periodYmd = today.slice(0, 7);
  const commId = `comm-golden-${Date.now().toString(36)}`;
  const { error: commErr } = await sb.from("commission_entries").upsert(
    {
      id: commId,
      distributor_id: labTenant,
      registry_tenant_id: HQ,
      period_ymd: periodYmd,
      agent_key: agentKey,
      agent_name: ownerAgent?.display_name || agentKey,
      collected_amount: total,
      revenue_attributed: total,
      commission_amount: Math.round(total * 0.05 * 100) / 100,
      collection_commission: Math.round(total * 0.05 * 100) / 100,
      revenue_commission: 0,
      efficiency_pct: 100,
      labs_touched: 1,
      payment_count: 1,
      threshold_met: true,
      eligible: true,
      status: "approved",
      approved_at: new Date().toISOString(),
      metadata: { order_id: orderId, payment_id: paymentId, golden_path: true },
    },
    { onConflict: "id" }
  );
  if (commErr) console.warn("  commission:", commErr.message);
  else console.log(`  commission ${commId} → approved`);

  return { orderId, paymentId, commId };
}

async function report(sb) {
  const { count: labCount } = await sb.from("labs").select("*", { count: "exact", head: true });
  const { data: ownership } = await sb
    .from("lab_ownership")
    .select("id,lab_id,status")
    .eq("tenant_id", HQ)
    .eq("status", "ACTIVE");
  const { count: contractActive } = await sb
    .from("lab_contracts")
    .select("*", { count: "exact", head: true })
    .eq("status", "Active");
  const { data: quals } = await sb
    .from("lab_qualifications")
    .select("lab_id,pipeline_stage")
    .in("pipeline_stage", ["qualified", "won"]);
  const { data: agents } = await sb
    .from("profiles")
    .select("user_id,agent_id,display_name,active")
    .eq("tenant_id", HQ)
    .eq("role", "agent")
    .eq("active", true);

  const unassigned = (await sb.from("labs").select("lab_id,assigned_agent_id,agent_id")).data?.filter(
    (l) => !str(l.assigned_agent_id || l.agent_id)
  );

  console.log("\n=== FINAL COUNTS ===");
  console.log(JSON.stringify({
    labs: labCount,
    active_ownership: ownership?.length || 0,
    active_contracts: contractActive,
    qualified_or_won: quals?.length || 0,
    active_agents: agents?.length || 0,
    unassigned_labs: unassigned?.length || 0,
  }, null, 2));
}

async function main() {
  const env = loadEnv();
  const sb = await loginAdmin(env);
  console.log("Admin session OK\n");

  const { data: agents } = await sb
    .from("profiles")
    .select("agent_id,display_name,active")
    .eq("tenant_id", HQ)
    .eq("role", "agent")
    .eq("active", true)
    .not("agent_id", "is", null);
  const agentList = (agents || []).filter((a) => str(a.agent_id));
  console.log(`Active agents: ${agentList.length}`);

  const allLabs = await ensureLabs(sb, agentList);
  await ensureOwnership(sb, allLabs, agentList);
  await goldenPath(sb, agentList);
  await report(sb);
  await sb.auth.signOut();
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
