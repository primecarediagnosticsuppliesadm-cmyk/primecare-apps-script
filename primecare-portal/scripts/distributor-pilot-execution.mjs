#!/usr/bin/env node
/**
 * Distributor pilot data execution — ops only, no app changes.
 * Usage: node scripts/distributor-pilot-execution.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";
const DIST = "787999b9-72f5-4163-a860-551c12ce3414";
const TARGET_LABS = 25;
const TARGET_AGENTS = 5;
const GOLDEN_LAB = "LAB-GUNTUR-DIAGNOSTIC-CENTER-ZEUM";

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

function labKey(tenantId, labId) {
  return `${str(tenantId).toLowerCase()}::${str(labId).toLowerCase()}`;
}

async function loginExecutive(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Executive auth: ${error.message}`);
  return sb;
}

async function createLab(sb, { labId, labName, agentId }) {
  const row = {
    tenant_id: DIST,
    lab_id: labId,
    lab_name: labName,
    owner_name: "Pilot Contact",
    phone: "9876500000",
    area: "Guntur",
    credit_terms: "Net 30",
    status: "ACTIVE",
    assigned_agent_id: agentId || null,
    agent_id: agentId || null,
  };
  const { error: labErr } = await sb.from("labs").insert([row]);
  if (labErr) return { ok: false, error: labErr.message };

  const { error: arErr } = await sb.from("ar_credit_control").insert([
    {
      tenant_id: DIST,
      lab_id: labId,
      lab_name: labName,
      credit_limit: 50000,
      outstanding: 0,
      total_delivered: 0,
      total_paid: 0,
      collections_notes: `contact_email:${labId.toLowerCase()}@dist-pilot.test`,
    },
  ]);
  if (arErr) {
    await sb.from("labs").delete().eq("tenant_id", DIST).eq("lab_id", labId);
    return { ok: false, error: arErr.message };
  }
  return { ok: true };
}

async function assignOwnership(sb, labId, agentId) {
  const { error } = await sb.rpc("assign_lab_ownership", {
    p_tenant_id: HQ,
    p_lab_tenant_id: DIST,
    p_lab_id: labId,
    p_primary_agent_id: agentId,
    p_secondary_agent_id: null,
    p_manager_id: null,
    p_assigned_by: null,
  });
  if (error) return error.message;
  await sb
    .from("labs")
    .update({ assigned_agent_id: agentId, agent_id: agentId })
    .eq("tenant_id", DIST)
    .eq("lab_id", labId);
  return null;
}

async function ensureLabsAndOwnership(sb, agentIds) {
  const { data: existing } = await sb
    .from("labs")
    .select("lab_id,lab_name,assigned_agent_id,agent_id")
    .eq("tenant_id", DIST);
  const labs = existing || [];
  const need = Math.max(0, TARGET_LABS - labs.length);
  console.log(`Labs: ${labs.length} existing, creating ${need}`);

  let created = 0;
  const usedIds = new Set(labs.map((l) => str(l.lab_id).toUpperCase()));
  for (let i = 0; i < need; i++) {
    let n = labs.length + created + 1;
    let labId = `DIST_PILOT_${String(n).padStart(3, "0")}`;
    while (usedIds.has(labId)) {
      n += 1;
      labId = `DIST_PILOT_${String(n).padStart(3, "0")}`;
    }
    usedIds.add(labId);
    const agentId = agentIds[(n - 1) % agentIds.length];
    const res = await createLab(sb, { labId, labName: `Dist Pilot Lab ${n}`, agentId });
    if (!res.ok) {
      console.warn(`  skip ${labId}: ${res.error}`);
      continue;
    }
    created++;
    console.log(`  created ${labId}`);
  }

  const { data: allLabs } = await sb
    .from("labs")
    .select("lab_id,assigned_agent_id,agent_id")
    .eq("tenant_id", DIST);
  let owned = 0;
  for (let i = 0; i < (allLabs || []).length; i++) {
    const lab = allLabs[i];
    const agentId =
      str(lab.assigned_agent_id || lab.agent_id) || agentIds[i % agentIds.length];
    const err = await assignOwnership(sb, lab.lab_id, agentId);
    if (!err) owned++;
    else console.warn(`  ownership ${lab.lab_id}: ${err}`);
  }
  console.log(`Ownership applied: ${owned}/${allLabs?.length}`);
  return allLabs?.length || 0;
}

async function ensureQualification(sb, labId, agent) {
  const { data: existing } = await sb
    .from("lab_qualifications")
    .select("id")
    .eq("tenant_id", DIST)
    .eq("lab_id", labId)
    .maybeSingle();

  const now = new Date().toISOString();
  const row = {
    tenant_id: DIST,
    lab_id: labId,
    pipeline_stage: "won",
    pipeline_stage_updated_at: now,
    founder_review_status: "approved",
    qualification_band: "qualified",
    qualification_score: 85,
    agent_id: agent?.agent_id || "QA_TEST_AGENT_001",
    agent_name: agent?.display_name || "QA Test Agent One",
    monthly_consumables_estimate: 10000,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await sb
      .from("lab_qualifications")
      .update(row)
      .eq("tenant_id", DIST)
      .eq("lab_id", labId);
    if (error) return error.message;
  } else {
    const { error } = await sb.from("lab_qualifications").insert([row]);
    if (error) return error.message;
  }
  return null;
}

async function ensureActiveContract(sb, labId, labName) {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const endDate = end.toISOString().slice(0, 10);

  const { data: existing } = await sb
    .from("lab_contracts")
    .select("id,status")
    .eq("distributor_id", DIST)
    .eq("lab_id", labId)
    .limit(1);

  if (existing?.length) {
    const { error } = await sb
      .from("lab_contracts")
      .update({
        status: "Active",
        start_date: today,
        end_date: endDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing[0].id);
    if (error) return { error: error.message };
    return { contractId: existing[0].id };
  }

  const id = `contract-dist-golden-${Date.now().toString(36)}`;
  const { error } = await sb.from("lab_contracts").insert([
    {
      id,
      contract_number: `CNT-DIST-GOLDEN-001`,
      distributor_id: DIST,
      registry_tenant_id: HQ,
      lab_id: labId,
      lab_name: labName,
      contract_type: "L1A Consumables",
      status: "Active",
      start_date: today,
      end_date: endDate,
      auto_renewal: true,
      payment_terms: "30 Days",
      credit_limit: 50000,
      monthly_commitment: 10000,
      collection_target_pct: 80,
      distributor_margin_pct: 10,
      primecare_margin_pct: 5,
      metadata: { golden_path: true, distributor_pilot: true },
    },
  ]);
  if (error) return { error: error.message };
  return { contractId: id };
}

async function revenuePath(sb, labId, agent) {
  const { data: inv } = await sb
    .from("inventory")
    .select("product_id,current_stock")
    .eq("tenant_id", DIST)
    .gt("current_stock", 0)
    .limit(1);
  const sku = inv?.[0];
  if (!sku) return { error: "No in-stock SKU for distributor" };

  const today = new Date().toISOString().slice(0, 10);
  const orderId = `ORD-DIST-GOLDEN-${Date.now().toString(36)}`;
  const qty = 2;
  const unitPrice = 500;
  const total = qty * unitPrice;

  const { error: ordErr } = await sb.from("orders").insert([
    {
      order_id: orderId,
      tenant_id: DIST,
      lab_id: labId,
      order_date: today,
      status: "Placed",
      total_amount: total,
      created_by: "distributor-pilot-execution",
      created_at: new Date().toISOString(),
    },
  ]);
  if (ordErr) return { error: `order: ${ordErr.message}` };

  const { error: itemErr } = await sb.from("order_items").insert([
    {
      order_id: orderId,
      tenant_id: DIST,
      product_id: sku.product_id,
      quantity: qty,
      unit_price: unitPrice,
      total_price: total,
    },
  ]);
  if (itemErr) console.warn("  order_items:", itemErr.message);

  await sb
    .from("orders")
    .update({ status: "Fulfilled", updated_at: new Date().toISOString() })
    .eq("order_id", orderId);

  const paymentId = `PAY-DIST-GOLDEN-${Date.now().toString(36)}`;
  const { error: payErr } = await sb.from("payments").insert([
    {
      payment_id: paymentId,
      tenant_id: DIST,
      lab_id: labId,
      order_id: orderId,
      amount_received: total,
      payment_date: today,
      mode: "Cash",
    },
  ]);
  if (payErr) return { error: `payment: ${payErr.message}` };

  const commId = `comm-dist-golden-${Date.now().toString(36)}`;
  const agentKey = str(agent?.agent_id || "QA_TEST_AGENT_001");
  const { error: commErr } = await sb.from("commission_entries").upsert(
    {
      id: commId,
      distributor_id: DIST,
      registry_tenant_id: HQ,
      period_ymd: today.slice(0, 7),
      agent_key: agentKey,
      agent_name: agent?.display_name || agentKey,
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
      metadata: {
        order_id: orderId,
        payment_id: paymentId,
        golden_path: true,
        distributor_pilot: true,
      },
    },
    { onConflict: "id" }
  );
  if (commErr) return { error: `commission: ${commErr.message}` };

  return { orderId, paymentId, commId, total };
}

async function audit(sb) {
  const { data: labs } = await sb.from("labs").select("lab_id").eq("tenant_id", DIST);
  const { data: own } = await sb
    .from("lab_ownership")
    .select("lab_id")
    .eq("tenant_id", HQ)
    .eq("lab_tenant_id", DIST)
    .eq("status", "ACTIVE");
  const ownedSet = new Set((own || []).map((r) => str(r.lab_id).toLowerCase()));
  const unassigned = (labs || []).filter(
    (l) => !ownedSet.has(str(l.lab_id).toLowerCase())
  );
  const { data: quals } = await sb
    .from("lab_qualifications")
    .select("lab_id,pipeline_stage")
    .eq("tenant_id", DIST)
    .in("pipeline_stage", ["qualified", "won"]);
  const { count: contracts } = await sb
    .from("lab_contracts")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", DIST)
    .eq("status", "Active");
  const { data: agents } = await sb
    .from("profiles")
    .select("agent_id")
    .eq("tenant_id", HQ)
    .eq("role", "agent")
    .eq("active", true)
    .not("agent_id", "is", null);

  return {
    labCount: labs?.length || 0,
    ownershipActive: own?.length || 0,
    unassigned: unassigned.map((l) => l.lab_id),
    coveragePct: labs?.length
      ? Math.round(((own?.length || 0) / labs.length) * 100)
      : 0,
    qualifiedWon: quals?.length || 0,
    activeContracts: contracts || 0,
    activeAgents: (agents || []).length,
  };
}

async function main() {
  const env = loadEnv();
  const sb = await loginExecutive(env);
  console.log("Executive session OK\n");

  const { data: agents } = await sb
    .from("profiles")
    .select("agent_id,display_name")
    .eq("tenant_id", HQ)
    .eq("role", "agent")
    .eq("active", true)
    .not("agent_id", "is", null);
  const agentList = (agents || []).filter((a) => str(a.agent_id));
  console.log(`Active agents: ${agentList.length} (target ${TARGET_AGENTS})`);
  const agentIds = agentList.slice(0, TARGET_AGENTS).map((a) => a.agent_id);

  await ensureLabsAndOwnership(sb, agentIds);

  const goldenAgent =
    agentList.find((a) => a.agent_id === "QA_TEST_AGENT2") || agentList[0];
  const qualErr = await ensureQualification(sb, GOLDEN_LAB, goldenAgent);
  if (qualErr) console.warn("Qualification:", qualErr);
  else console.log(`Qualification → won: ${GOLDEN_LAB}`);

  const { data: goldenLab } = await sb
    .from("labs")
    .select("lab_name")
    .eq("tenant_id", DIST)
    .eq("lab_id", GOLDEN_LAB)
    .maybeSingle();
  const contractRes = await ensureActiveContract(
    sb,
    GOLDEN_LAB,
    goldenLab?.lab_name || "Guntur Diagnostic Center"
  );
  if (contractRes.error) console.warn("Contract:", contractRes.error);
  else console.log(`Contract Active: ${contractRes.contractId}`);

  const rev = await revenuePath(sb, GOLDEN_LAB, goldenAgent);
  if (rev.error) console.warn("Revenue path:", rev.error);
  else console.log("Revenue path:", rev);

  // Fix HQ golden commission if still broken
  await sb
    .from("commission_entries")
    .update({
      metadata: {
        order_id: "ORD-GOLDEN-mqrhd7e1",
        payment_id: "PAY-GOLDEN-mqrhd7fix",
        golden_path: true,
      },
    })
    .eq("id", "comm-golden-mqrhd7t6");

  const report = await audit(sb);
  console.log("\n=== AUDIT ===");
  console.log(JSON.stringify(report, null, 2));

  await sb.auth.signOut();
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
