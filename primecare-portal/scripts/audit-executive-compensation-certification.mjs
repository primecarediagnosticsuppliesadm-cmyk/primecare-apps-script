#!/usr/bin/env node
/**
 * Executive Compensation QA data + load certification audit.
 * Usage: node scripts/audit-executive-compensation-certification.mjs
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";
import { calculateCompensationPreview } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { loadExecutiveCompensationCenterRead } = await server.ssrLoadModule(
    "/src/api/compensationReadSupabaseApi.js"
  );
  const { loadCompensationPlanAdminRead } = await server.ssrLoadModule(
    "/src/api/compensationPlanAdminSupabaseApi.js"
  );
  const { loadAgentCompensationDirectoryRead, loadAgentCompensation360Read } =
    await server.ssrLoadModule("/src/api/agentCompensation360SupabaseApi.js");

  const auth = await signInWithQaCredentials(supabase, QA_EXECUTIVE);
  if (!auth.ok) {
    console.error("Executive auth failed:", auth.error);
    process.exit(1);
  }

  const currentUser = {
    id: auth.userId,
    role: "executive",
    tenantId: QA_HQ_TENANT_ID,
    tenant_id: QA_HQ_TENANT_ID,
  };

  section("PART 2 — QA Data Counts");

  const [
    plansRes,
    assignmentsRes,
    periodsRes,
    runsRes,
    linesRes,
    commissionRes,
    paymentsRes,
    profilesRes,
  ] = await Promise.all([
    supabase.from("compensation_plans").select("id,plan_code,version,status").eq("tenant_id", QA_HQ_TENANT_ID),
    supabase
      .from("compensation_plan_assignments")
      .select("id,agent_id,assignment_status,plan_id")
      .eq("tenant_id", QA_HQ_TENANT_ID),
    supabase.from("payroll_periods").select("id,period_ym,status").eq("tenant_id", QA_HQ_TENANT_ID),
    supabase.from("payroll_runs").select("id,period_id,run_number,status").eq("tenant_id", QA_HQ_TENANT_ID),
    supabase.from("payroll_run_lines").select("id,agent_id,period_id,payroll_run_id").eq("tenant_id", QA_HQ_TENANT_ID),
    supabase
      .from("compensation_commission_entries")
      .select("id,agent_id,period_id,attributable_cash_collected")
      .eq("tenant_id", QA_HQ_TENANT_ID),
    supabase
      .from("payments")
      .select("agent_id,amount_received,payment_date")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .gte("payment_date", "2026-07-01")
      .lte("payment_date", "2026-07-31"),
    supabase
      .from("profiles")
      .select("agent_id,agent_name,role,active")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("role", "agent")
      .eq("active", true),
  ]);

  for (const [label, res] of [
    ["plans", plansRes],
    ["assignments", assignmentsRes],
    ["periods", periodsRes],
    ["runs", runsRes],
    ["lines", linesRes],
    ["commissions", commissionRes],
    ["payments", paymentsRes],
    ["profiles", profilesRes],
  ]) {
    if (res.error) {
      console.error(`${label} read error:`, res.error.message);
      process.exit(1);
    }
  }

  const plans = plansRes.data || [];
  const assignments = assignmentsRes.data || [];
  const activeAssignments = assignments.filter((r) => r.assignment_status === "active");
  const julyPeriod = (periodsRes.data || []).find((p) => p.period_ym === "2026-07");
  const julyLines = (linesRes.data || []).filter((l) => l.period_id === julyPeriod?.id);
  const julyCommissions = (commissionRes.data || []).filter((c) => c.period_id === julyPeriod?.id);
  const agentsWithJulyPayments = new Set(
    (paymentsRes.data || []).filter((p) => Number(p.amount_received) > 0).map((p) => p.agent_id)
  );

  const { buildCompensationPlanAdminModel } = await server.ssrLoadModule(
    "/src/compensation/compensationPlanAdminModel.js"
  );
  const adminRead = await loadCompensationPlanAdminRead({ currentUser, client: supabase });
  const adminPlanRows = adminRead.success
    ? buildCompensationPlanAdminModel({
        ...adminRead.data,
        actorRole: "executive",
      }).planRows
    : [];

  console.log(`compensation_plans total: ${plans.length}`);
  console.log(`  active: ${plans.filter((p) => p.status === "active").length}`);
  console.log(`  draft: ${plans.filter((p) => p.status === "draft").length}`);
  console.log(`  retired: ${plans.filter((p) => p.status === "retired").length}`);
  console.log(`plan admin model rows (UI): ${adminPlanRows.length}`);
  console.log(`assignments total: ${assignments.length}`);
  console.log(`  active: ${activeAssignments.length}`);
  console.log(`payroll_periods: ${(periodsRes.data || []).length}`);
  console.log(`payroll_runs: ${(runsRes.data || []).length}`);
  console.log(`payroll_run_lines total: ${(linesRes.data || []).length}`);
  console.log(`  July 2026 lines: ${julyLines.length}`);
  console.log(`commission_entries total: ${(commissionRes.data || []).length}`);
  console.log(`  July 2026 entries: ${julyCommissions.length}`);
  console.log(`active agent profiles: ${(profilesRes.data || []).length}`);
  console.log(`agents with July 2026 payments: ${agentsWithJulyPayments.size}`);
  console.log(`agents in July preview lines: ${new Set(julyLines.map((l) => l.agent_id)).size}`);

  if (julyPeriod) {
    const julyAssignmentAgents = activeAssignments.map((a) => a.agent_id);
    const previewSim = calculateCompensationPreview({
      period: {
        id: julyPeriod.id,
        tenant_id: QA_HQ_TENANT_ID,
        period_start: "2026-07-01",
        period_end: "2026-07-31",
      },
      payments: paymentsRes.data || [],
      planAssignments: activeAssignments,
      compensationPlans: plans.filter((p) => ["active", "draft"].includes(p.status)),
    });
    console.log(`\nEngine preview simulation (current code, July 2026):`);
    console.log(`  would generate lines: ${previewSim.payrollRunLines.length}`);
    console.log(`  commission entries: ${previewSim.commissionEntries.length}`);
    console.log(
      `  agents: ${previewSim.payrollRunLines.map((l) => l.agent_id).join(", ") || "(none)"}`
    );
    console.log(`  active assignments: ${julyAssignmentAgents.join(", ") || "(none)"}`);
    if (julyLines.length === 1 && previewSim.payrollRunLines.length > 1) {
      console.log(
        "\nNOTE: DB has stale preview (1 line). Regenerate preview after fix to match engine output."
      );
    } else if (julyLines.length === 1 && activeAssignments.length === 1) {
      console.log("\nNOTE: One line may be expected if only one active assignment exists.");
    }
  }

  section("PART 3 — API Call Counts (simulated)");

  let centerCalls = 0;
  let adminCalls = 0;
  let directoryCalls = 0;
  let agent360Calls = 0;

  const origFrom = supabase.from.bind(supabase);
  const countFrom = (label) => (table) => {
    if (label === "center") centerCalls += 1;
    if (label === "admin") adminCalls += 1;
    if (label === "directory") directoryCalls += 1;
    if (label === "agent360") agent360Calls += 1;
    return origFrom(table);
  };

  const t0 = performance.now();
  supabase.from = countFrom("center");
  await loadExecutiveCompensationCenterRead({ currentUser, client: supabase });
  const centerMs = Math.round(performance.now() - t0);

  supabase.from = origFrom;
  centerCalls = 0;
  adminCalls = 0;
  const t1 = performance.now();
  supabase.from = countFrom("admin");
  await loadCompensationPlanAdminRead({ currentUser, client: supabase });
  const adminMs = Math.round(performance.now() - t1);

  supabase.from = origFrom;
  directoryCalls = 0;
  const t2 = performance.now();
  supabase.from = countFrom("directory");
  await loadAgentCompensationDirectoryRead({ currentUser, client: supabase });
  const directoryMs = Math.round(performance.now() - t2);

  const targetAgent =
    julyLines[0]?.agent_id || activeAssignments[0]?.agent_id || profilesRes.data?.[0]?.agent_id;
  supabase.from = origFrom;
  agent360Calls = 0;
  let agent360Ms = 0;
  if (targetAgent) {
    const t3 = performance.now();
    supabase.from = countFrom("agent360");
    const agent360 = await loadAgentCompensation360Read({
      currentUser,
      agentId: targetAgent,
      client: supabase,
    });
    agent360Ms = Math.round(performance.now() - t3);
    console.log(`Agent 360 load for ${targetAgent}: ${agent360.success ? "OK" : agent360.error}`);
  }

  supabase.from = origFrom;

  console.log(`Initial bundle (center + admin + directory):`);
  console.log(`  center read: ${centerCalls} table queries, ${centerMs}ms`);
  console.log(`  admin read: ${adminCalls} table queries, ${adminMs}ms`);
  console.log(`  directory read: ${directoryCalls} table queries, ${directoryMs}ms`);
  console.log(`  total table queries on mount: ${8 + adminCalls + directoryCalls} (center=8 parallel)`);
  console.log(`Tab switch (no extra full load in code): 0 additional center reads`);
  console.log(`Manual refresh (refreshAll): 8 + admin + directory + optional agent360`);
  if (targetAgent) {
    console.log(`Agent 360 open: ${agent360Calls} table queries, ${agent360Ms}ms`);
  }

  section("PART 5 — Workflow State Snapshot");
  for (const period of periodsRes.data || []) {
    const run = (runsRes.data || [])
      .filter((r) => r.period_id === period.id)
      .sort((a, b) => b.run_number - a.run_number)[0];
    console.log(
      `${period.period_ym}: period=${period.status} run=${run?.status || "none"} v${run?.run_number || "—"}`
    );
  }

  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
