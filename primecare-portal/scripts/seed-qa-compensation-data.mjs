#!/usr/bin/env node
/**
 * QA-only compensation assignment seed/repair.
 * Mutates compensation_plan_assignments (+ audit) only. No finance/O2C writes.
 *
 * Usage:
 *   node scripts/seed-qa-compensation-data.mjs          # dry-run report
 *   node scripts/seed-qa-compensation-data.mjs --apply    # insert missing assignments
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";
import { HQ_PAYMENT_COLUMNS } from "../src/api/hqReadBounds.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const JULY_START = "2026-07-01";
const JULY_END = "2026-07-31";
const ASSIGNMENT_START = "2026-01-01";
const TARGET_ASSIGNMENTS = 5;

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value) {
  return String(value ?? "").trim();
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const auth = await signInWithQaCredentials(supabase, QA_EXECUTIVE);
  if (!auth.ok) {
    console.error("Executive auth failed:", auth.error);
    process.exit(1);
  }

  const [
    profilesRes,
    plansRes,
    assignmentsRes,
    paymentsRes,
    cumulativeRes,
    labsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id,agent_id,agent_name,role,active")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("role", "agent")
      .eq("active", true)
      .not("agent_id", "is", null),
    supabase
      .from("compensation_plans")
      .select("id,plan_code,version,status")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1),
    supabase
      .from("compensation_plan_assignments")
      .select("id,agent_id,assignment_status,plan_id,start_date,metadata")
      .eq("tenant_id", QA_HQ_TENANT_ID),
    supabase
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .gte("payment_date", JULY_START)
      .lte("payment_date", JULY_END),
    supabase
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .lte("payment_date", JULY_END),
    supabase
      .from("v_labs_credit")
      .select("lab_id,lab_name,assigned_agent_id,days_overdue,outstanding,tenant_id")
      .eq("tenant_id", QA_HQ_TENANT_ID),
  ]);

  for (const [label, res] of [
    ["profiles", profilesRes],
    ["plans", plansRes],
    ["assignments", assignmentsRes],
    ["payments.july", paymentsRes],
    ["payments.cumulative", cumulativeRes],
    ["labs", labsRes],
  ]) {
    if (res.error) {
      console.error(`${label} read failed:`, res.error.message);
      process.exit(1);
    }
  }

  const plan = plansRes.data?.[0];
  if (!plan) {
    console.error("No active compensation plan in QA tenant.");
    process.exit(1);
  }

  const profiles = profilesRes.data || [];
  const activeAssignments = (assignmentsRes.data || []).filter((row) => row.assignment_status === "active");
  const assignedAgentIds = new Set(activeAssignments.map((row) => str(row.agent_id)));

  const julyCashByAgent = new Map();
  for (const payment of paymentsRes.data || []) {
    const agentId = str(payment.agent_id);
    if (!agentId || num(payment.amount_received) <= 0) continue;
    julyCashByAgent.set(agentId, roundMoney(julyCashByAgent.get(agentId) + num(payment.amount_received)));
  }

  const cumulativeCashByAgent = new Map();
  for (const payment of cumulativeRes.data || []) {
    const agentId = str(payment.agent_id);
    if (!agentId || num(payment.amount_received) <= 0) continue;
    cumulativeCashByAgent.set(
      agentId,
      roundMoney(cumulativeCashByAgent.get(agentId) + num(payment.amount_received))
    );
  }

  const overdueByAgent = new Map();
  for (const lab of labsRes.data || []) {
    const agentId = str(lab.assigned_agent_id);
    if (!agentId) continue;
    const days = num(lab.days_overdue);
    overdueByAgent.set(agentId, Math.max(overdueByAgent.get(agentId) || 0, days));
  }

  const profileByAgentId = new Map(profiles.map((row) => [str(row.agent_id), row]));
  const availableAgents = profiles
    .map((row) => str(row.agent_id))
    .filter(Boolean)
    .sort();

  section(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Active plan: ${plan.plan_code} ${plan.version} (${plan.id})`);
  console.log(`Active agent profiles: ${profiles.length}`);
  console.log(`Existing active assignments: ${activeAssignments.length}`);

  const picks = [];
  const used = new Set();

  const cashAgent =
    [...julyCashByAgent.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
    activeAssignments[0]?.agent_id ||
    "QA_AGENT_001";
  if (profileByAgentId.has(str(cashAgent))) {
    picks.push({
      agentId: str(cashAgent),
      tag: "cash_collector",
      note: `July 2026 collected cash ₹${(julyCashByAgent.get(str(cashAgent)) || 0).toLocaleString("en-IN")}`,
    });
    used.add(str(cashAgent));
  }

  for (const agentId of availableAgents) {
    if (used.has(agentId)) continue;
    if (julyCashByAgent.has(agentId)) continue;
    picks.push({ agentId, tag: "zero_collection", note: "No July 2026 attributable payments" });
    used.add(agentId);
    if (picks.filter((p) => p.tag === "zero_collection").length >= 2) break;
  }

  const promotionCandidate = [...cumulativeCashByAgent.entries()]
    .filter(([agentId]) => profileByAgentId.has(agentId) && !used.has(agentId))
    .sort((a, b) => b[1] - a[1])[0];
  if (promotionCandidate) {
    const [agentId, total] = promotionCandidate;
    picks.push({
      agentId,
      tag: "promotion_near",
      note: `Highest cumulative attributable cash in QA snapshot ₹${total.toLocaleString("en-IN")} (review-only eligibility)`,
    });
    used.add(agentId);
  }

  const overdueCandidate = [...overdueByAgent.entries()]
    .filter(([agentId, days]) => profileByAgentId.has(agentId) && days > 90 && !used.has(agentId))
    .sort((a, b) => b[1] - a[1])[0];
  if (overdueCandidate) {
    const [agentId, days] = overdueCandidate;
    picks.push({
      agentId,
      tag: "overdue_blocked",
      note: `Lab ownership snapshot shows max overdue ${days} days (>90 promotion blocker)`,
    });
    used.add(agentId);
  } else {
    console.log("NOTE: No QA lab snapshot with >90 days overdue found; overdue_blocked tag skipped (no finance/O2C mutation).");
  }

  for (const agentId of availableAgents) {
    if (picks.length >= TARGET_ASSIGNMENTS) break;
    if (used.has(agentId)) continue;
    picks.push({ agentId, tag: "assigned_support", note: "Additional assigned agent for multi-agent preview" });
    used.add(agentId);
  }

  const planned = picks.slice(0, TARGET_ASSIGNMENTS).map((pick) => {
    const profile = profileByAgentId.get(pick.agentId);
    return {
      ...pick,
      agentName: profile?.agent_name || pick.agentId,
      profileUserId: profile?.user_id || null,
      alreadyAssigned: assignedAgentIds.has(pick.agentId),
    };
  });

  section("Planned QA assignment targets");
  for (const row of planned) {
    console.log(
      `- ${row.agentId} (${row.agentName}) [${row.tag}] ${row.alreadyAssigned ? "KEEP existing" : "INSERT"} — ${row.note}`
    );
  }

  const toInsert = planned.filter((row) => !row.alreadyAssigned);
  console.log(`\nNew assignments to insert: ${toInsert.length}`);

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to insert compensation assignments only.");
    await server.close();
    return;
  }

  if (!toInsert.length) {
    console.log("\nNothing to insert; QA assignments already satisfy target set.");
    await server.close();
    return;
  }

  for (const row of toInsert) {
    const insert = await supabase
      .from("compensation_plan_assignments")
      .insert([
        {
          tenant_id: QA_HQ_TENANT_ID,
          plan_id: plan.id,
          profile_user_id: row.profileUserId,
          agent_id: row.agentId,
          agent_name: row.agentName,
          assignment_status: "active",
          start_date: ASSIGNMENT_START,
          assigned_by: auth.userId,
          metadata: {
            qa_seed: true,
            qa_seed_tag: row.tag,
            qa_seed_note: row.note,
            no_finance_mutation: true,
          },
        },
      ])
      .select("id,agent_id")
      .single();

    if (insert.error) {
      console.error(`Insert failed for ${row.agentId}:`, insert.error.message);
      process.exit(1);
    }

    await supabase.from("compensation_audit_events").insert([
      {
        tenant_id: QA_HQ_TENANT_ID,
        event_type: "plan_assignment_seeded",
        entity_type: "compensation_plan_assignment",
        entity_id: insert.data.id,
        actor_user_id: auth.userId,
        actor_role: "executive",
        after_json: {
          agent_id: row.agentId,
          plan_id: plan.id,
          qa_seed_tag: row.tag,
        },
        reason: "qa_compensation_seed_assignment",
        metadata: { qa_seed: true, no_finance_mutation: true },
      },
    ]);

    console.log(`INSERTED ${row.agentId} (${row.tag}) → ${insert.data.id}`);
  }

  const { count } = await supabase
    .from("compensation_plan_assignments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("assignment_status", "active");

  console.log(`\nActive assignments after seed: ${count ?? 0}`);
  console.log("\nOverall: GO\n");
  await server.close();
}

function roundMoney(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
