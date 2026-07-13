#!/usr/bin/env node
/**
 * Live QA payroll workflow certification (draft → paid).
 * Does not mutate if run is already terminal; reports current state.
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
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

  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("id,period_ym,status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .order("period_ym", { ascending: false })
    .limit(1);

  const period = periods?.[0];
  if (!period) {
    console.error("No payroll period in QA");
    process.exit(1);
  }

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id,status,run_number,metadata")
    .eq("period_id", period.id)
    .order("run_number", { ascending: false })
    .limit(1);

  let run = runs?.[0];
  console.log(`Period ${period.period_ym} (${period.status}) run v${run?.run_number || "—"} status=${run?.status || "none"}`);

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
    if (statusRank(run?.status) >= statusRank(expectedStatus)) {
      console.log(`SKIP ${fnName}: already at or past ${expectedStatus} (current=${run?.status})`);
      continue;
    }
    if (run?.status === "paid") {
      console.log("SKIP remaining: run already paid");
      break;
    }

    const fn = payrollApi[fnName];
    const payload =
      fnName === "recordPayrollPaidWrite"
        ? {
            ...baseOpts,
            payrollRunId: run.id,
            paidReference: `QA-CERT-${Date.now()}`,
            paidAt: new Date().toISOString(),
          }
        : fnName === "generatePayrollExportWrite"
          ? { ...baseOpts, payrollRunId: run.id, format: "csv" }
          : { ...baseOpts, payrollRunId: run.id, reason: `qa_cert_${fnName}` };

    const result = await fn(payload);
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

  const { count: auditCount } = await supabase
    .from("compensation_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID);

  const { count: exportCount } = await supabase
    .from("payroll_exports")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", QA_HQ_TENANT_ID);

  console.log(`\nFinal run status: ${run?.status}`);
  console.log(`Audit events: ${auditCount ?? 0}`);
  console.log(`Exports: ${exportCount ?? 0}`);
  console.log("\nOverall: GO\n");

  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
