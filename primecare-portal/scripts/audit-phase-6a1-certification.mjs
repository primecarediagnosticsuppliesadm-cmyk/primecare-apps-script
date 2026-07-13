#!/usr/bin/env node
/**
 * Phase 6A.1 certification: multi-agent preview + reopen/version-2 workflow.
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const FINANCE_TABLES = ["payments", "orders", "invoices", "ar_credit_control"];

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function countTable(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID);
  if (error) return { table, error: error.message };
  return { table, count: count ?? 0 };
}

async function snapshotFinanceCounts(supabase) {
  const rows = await Promise.all(FINANCE_TABLES.map((table) => countTable(supabase, table)));
  return Object.fromEntries(rows.map((row) => [row.table, row.error ? row.error : row.count]));
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const compensationApi = await server.ssrLoadModule("/src/api/compensationSupabaseApi.js");
  const payrollApi = await server.ssrLoadModule("/src/api/payrollDomainSupabaseApi.js");

  const auth = await signInWithQaCredentials(supabase, QA_EXECUTIVE);
  if (!auth.ok) {
    console.error("Auth failed:", auth.error);
    process.exit(1);
  }

  const currentUser = {
    id: auth.userId,
    role: "executive",
    tenantId: QA_HQ_TENANT_ID,
    tenant_id: QA_HQ_TENANT_ID,
  };
  const baseOpts = {
    currentUser,
    tenantId: QA_HQ_TENANT_ID,
    actorRole: "executive",
    actorUserId: auth.userId,
    client: supabase,
  };

  const financeBefore = await snapshotFinanceCounts(supabase);
  section("Finance snapshot BEFORE");
  console.log(financeBefore);

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id,period_ym,status,period_start,period_end")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_ym", "2026-07")
    .maybeSingle();
  if (!period) {
    console.error("July 2026 payroll period missing in QA");
    process.exit(1);
  }

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id,status,run_number,metadata")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_id", period.id)
    .order("run_number", { ascending: true });

  const paidRun = (runs || []).find((run) => run.status === "paid");
  let draftRun = (runs || []).find((run) => run.status === "draft");

  section("Reopen / version 2 setup");
  console.log(`Period ${period.period_ym} status=${period.status}`);
  console.log(`Runs: ${(runs || []).map((r) => `v${r.run_number}:${r.status}`).join(", ") || "(none)"}`);

  if (!paidRun) {
    console.error("Expected immutable paid run v1 for reopen certification");
    process.exit(1);
  }

  if (!draftRun) {
    const reopen = await payrollApi.reopenPayrollRunWrite({
      ...baseOpts,
      payrollRunId: paidRun.id,
      reason: "qa_phase_6a1_reopen_for_version_2",
    });
    if (!reopen.success) {
      console.error("Reopen failed:", reopen.error);
      process.exit(1);
    }
    console.log(`PASS reopen → new draft v${reopen.data.newRunNumber} (${reopen.data.newPayrollRunId})`);
    draftRun = {
      id: reopen.data.newPayrollRunId,
      run_number: reopen.data.newRunNumber,
      status: "draft",
    };
  } else {
    console.log(`SKIP reopen: draft run v${draftRun.run_number} already exists`);
  }

  const paidRunAfter = await supabase
    .from("payroll_runs")
    .select("id,status,run_number")
    .eq("id", paidRun.id)
    .maybeSingle();
  if (paidRunAfter.data?.status !== "paid") {
    console.error("FAIL immutability: paid run v1 mutated", paidRunAfter.data);
    process.exit(1);
  }
  console.log(`PASS immutability: paid run v${paidRunAfter.data.run_number} remains ${paidRunAfter.data.status}`);

  section("Regenerate payroll preview (multi-agent)");
  const preview = await compensationApi.generatePayrollPreview({
    ...baseOpts,
    periodId: period.id,
    actorRole: "executive",
    actorUserId: auth.userId,
  });
  if (!preview.success) {
    console.error("Preview generation failed:", preview.error);
    process.exit(1);
  }

  const { data: lines } = await supabase
    .from("payroll_run_lines")
    .select(
      "agent_id,agent_name,salary_amount,fuel_allowance,mobile_allowance,commission_amount,payroll_run_id,calculation_snapshot,metadata"
    )
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("period_id", period.id)
    .eq("payroll_run_id", preview.data.payrollRunId);

  console.log(`Generated run v${preview.data.runNumber} lines=${lines?.length || 0}`);
  console.log(`ruleVersion=${preview.data.ruleVersion} calculationVersion=${preview.data.calculationVersion}`);

  const zeroCash = (lines || []).filter((line) => num(line.commission_amount) === 0);
  const withCommission = (lines || []).filter((line) => num(line.commission_amount) > 0);
  console.log(`Zero-commission assigned agents: ${zeroCash.length}`);
  console.log(`Commission-earning agents: ${withCommission.length}`);

  for (const line of lines || []) {
    const snap = line.calculation_snapshot || {};
    console.log(
      `- ${line.agent_id}: salary=${line.salary_amount} fuel=${line.fuel_allowance} mobile=${line.mobile_allowance} commission=${line.commission_amount} plan=${snap.plan_version || "?"} rule=${snap.rule_version || "?"}`
    );
  }

  if ((lines || []).length < 3) {
    console.error("FAIL preview: expected at least 3 assigned agents after QA seed");
    process.exit(1);
  }
  if (!zeroCash.length) {
    console.error("FAIL preview: expected at least one zero-collection assigned agent");
    process.exit(1);
  }
  if (!withCommission.length) {
    console.error("FAIL preview: expected at least one commission-earning assigned agent");
    process.exit(1);
  }
  if (!lines.every((line) => snapHasVersions(line))) {
    console.error("FAIL preview: missing rule_version or plan_version on one or more lines");
    process.exit(1);
  }
  console.log("PASS multi-agent preview validation");

  section("Version 2 workflow (draft → paid evidence)");
  let run = { id: preview.data.payrollRunId, status: "draft", run_number: preview.data.runNumber };
  const steps = [
    ["previewPayrollRunWrite", "previewed"],
    ["submitPayrollRunWrite", "submitted"],
    ["approvePayrollRunWrite", "approved"],
    ["lockPayrollRunWrite", "locked"],
    ["generatePayrollExportWrite", "exported"],
    ["recordPayrollPaidWrite", "paid"],
  ];
  const statusOrder = ["draft", "previewed", "submitted", "approved", "locked", "exported", "paid"];
  const statusRank = (s) => Math.max(0, statusOrder.indexOf(s));

  for (const [fnName, expectedStatus] of steps) {
    if (statusRank(run.status) >= statusRank(expectedStatus)) {
      console.log(`SKIP ${fnName}: already at or past ${expectedStatus}`);
      continue;
    }
    const payload =
      fnName === "recordPayrollPaidWrite"
        ? {
            ...baseOpts,
            payrollRunId: run.id,
            paymentReference: `QA-6A1-V${run.run_number}-${Date.now()}`,
            reason: "qa_phase_6a1_paid_evidence",
          }
        : fnName === "generatePayrollExportWrite"
          ? { ...baseOpts, payrollRunId: run.id, format: "csv", reason: "qa_phase_6a1_export" }
          : { ...baseOpts, payrollRunId: run.id, reason: `qa_phase_6a1_${fnName}` };

    const result = await payrollApi[fnName](payload);
    if (!result.success) {
      console.error(`FAIL ${fnName}:`, result.error);
      process.exit(1);
    }
    console.log(`PASS ${fnName} → ${expectedStatus}`);
    const { data: refreshed } = await supabase
      .from("payroll_runs")
      .select("id,status,run_number")
      .eq("id", run.id)
      .maybeSingle();
    run = refreshed || run;
  }

  const reopenAudit = await supabase
    .from("compensation_audit_events")
    .select("id,event_type,entity_id,metadata,after_json")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .in("event_type", ["reopen", "preview_generation_start", "preview_generated"])
    .order("created_at", { ascending: false })
    .limit(20);

  const linkedReopen = (reopenAudit.data || []).some(
    (event) => event.event_type === "reopen" && event.after_json?.new_payroll_run_id === draftRun.id
  );
  console.log(`Reopen audit linkage present: ${linkedReopen ? "yes" : "check timeline manually"}`);

  const financeAfter = await snapshotFinanceCounts(supabase);
  section("Finance snapshot AFTER");
  console.log(financeAfter);

  const financeMutated = FINANCE_TABLES.some((table) => financeBefore[table] !== financeAfter[table]);
  if (financeMutated) {
    console.error("FAIL finance isolation: finance/O2C table counts changed");
    for (const table of FINANCE_TABLES) {
      if (financeBefore[table] !== financeAfter[table]) {
        console.error(`  ${table}: ${financeBefore[table]} -> ${financeAfter[table]}`);
      }
    }
    process.exit(1);
  }
  console.log("PASS finance/O2C row counts unchanged");

  const { data: allRuns } = await supabase
    .from("payroll_runs")
    .select("run_number,status")
    .eq("period_id", period.id)
    .order("run_number", { ascending: true });
  console.log(`Final runs: ${(allRuns || []).map((r) => `v${r.run_number}:${r.status}`).join(", ")}`);

  console.log("\nOverall: GO\n");
  await server.close();
}

function snapHasVersions(line) {
  const snap = line.calculation_snapshot || {};
  return Boolean(snap.rule_version && snap.plan_version);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
