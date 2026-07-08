import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS,
  HQ_COMPENSATION_AUDIT_LIMIT,
  HQ_COMPENSATION_AUDIT_READ_COLUMNS,
  HQ_COMPENSATION_COMMISSION_LIMIT,
  HQ_COMPENSATION_COMMISSION_READ_COLUMNS,
  HQ_COMPENSATION_EXPORT_LIMIT,
  HQ_COMPENSATION_EXPORT_READ_COLUMNS,
  HQ_COMPENSATION_LINES_LIMIT,
  HQ_COMPENSATION_PERIODS_LIMIT,
  HQ_COMPENSATION_PLAN_READ_COLUMNS,
  HQ_COMPENSATION_RUNS_LIMIT,
  HQ_AR_COLUMNS,
  HQ_COLLECTIONS_AR_LIMIT,
  HQ_PAYMENT_COLUMNS,
  HQ_PAYMENTS_RECENT_LIMIT,
  HQ_PAYROLL_LINE_READ_COLUMNS,
  HQ_PAYROLL_PERIOD_READ_COLUMNS,
  HQ_PAYROLL_RUN_READ_COLUMNS,
  HQ_V_LABS_CREDIT_LIST_COLUMNS,
  clampLimit,
} from "@/api/hqReadBounds.js";

const PROFILE_COLUMNS = "user_id,tenant_id,role,agent_id,agent_name,display_name,username,email,active,created_at";

function str(value) {
  return String(value ?? "").trim();
}

function tenantIdFromUser(currentUser) {
  return str(currentUser?.tenantId || currentUser?.tenant_id);
}

function ensureClient(client = supabase) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

function readError(label, error) {
  throw new Error(`${label} read failed: ${error?.message || error}`);
}

/**
 * Executive Compensation Center — read-only bounded bundle.
 * Sources: payroll_periods, payroll_runs, payroll_run_lines, compensation_commission_entries,
 * compensation_plans, compensation_plan_assignments, compensation_audit_events, payroll_exports.
 */
export async function loadExecutiveCompensationCenterRead({
  currentUser,
  client = supabase,
  periodLimit = HQ_COMPENSATION_PERIODS_LIMIT,
  runLimit = HQ_COMPENSATION_RUNS_LIMIT,
  lineLimit = HQ_COMPENSATION_LINES_LIMIT,
} = {}) {
  const startedAt = performance.now();
  const db = ensureClient(client);
  const tenantId = tenantIdFromUser(currentUser);
  if (!tenantId) throw new Error("tenant_id_required");

  const boundedPeriodLimit = clampLimit(periodLimit, 1, HQ_COMPENSATION_PERIODS_LIMIT);
  const boundedRunLimit = clampLimit(runLimit, 1, HQ_COMPENSATION_RUNS_LIMIT);
  const boundedLineLimit = clampLimit(lineLimit, 1, HQ_COMPENSATION_LINES_LIMIT);
  const boundedCommissionLimit = clampLimit(
    HQ_COMPENSATION_COMMISSION_LIMIT,
    1,
    HQ_COMPENSATION_COMMISSION_LIMIT
  );
  const boundedAuditLimit = clampLimit(HQ_COMPENSATION_AUDIT_LIMIT, 1, HQ_COMPENSATION_AUDIT_LIMIT);
  const boundedExportLimit = clampLimit(HQ_COMPENSATION_EXPORT_LIMIT, 1, HQ_COMPENSATION_EXPORT_LIMIT);

  const [
    periodsRes,
    runsRes,
    linesRes,
    commissionRes,
    plansRes,
    assignmentsRes,
    auditRes,
    exportsRes,
    paymentsRes,
    arRes,
    labsRes,
    profilesRes,
  ] = await Promise.all([
    db
      .from("payroll_periods")
      .select(HQ_PAYROLL_PERIOD_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("period_ym", { ascending: false })
      .limit(boundedPeriodLimit),
    db
      .from("payroll_runs")
      .select(HQ_PAYROLL_RUN_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(boundedRunLimit),
    db
      .from("payroll_run_lines")
      .select(HQ_PAYROLL_LINE_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(boundedLineLimit),
    db
      .from("compensation_commission_entries")
      .select(HQ_COMPENSATION_COMMISSION_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(boundedCommissionLimit),
    db
      .from("compensation_plans")
      .select(HQ_COMPENSATION_PLAN_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", ["active", "draft", "retired"])
      .limit(200),
    db
      .from("compensation_plan_assignments")
      .select(HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("start_date", { ascending: false })
      .limit(500),
    db
      .from("compensation_audit_events")
      .select(HQ_COMPENSATION_AUDIT_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(boundedAuditLimit),
    db
      .from("payroll_exports")
      .select(HQ_COMPENSATION_EXPORT_READ_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(boundedExportLimit),
    db
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("payment_date", { ascending: false })
      .limit(clampLimit(HQ_PAYMENTS_RECENT_LIMIT, 1, HQ_PAYMENTS_RECENT_LIMIT)),
    db
      .from("ar_credit_control")
      .select(HQ_AR_COLUMNS)
      .eq("tenant_id", tenantId)
      .limit(clampLimit(HQ_COLLECTIONS_AR_LIMIT, 1, HQ_COLLECTIONS_AR_LIMIT)),
    db
      .from("v_labs_credit")
      .select(HQ_V_LABS_CREDIT_LIST_COLUMNS)
      .eq("tenant_id", tenantId)
      .limit(clampLimit(HQ_COLLECTIONS_AR_LIMIT, 1, HQ_COLLECTIONS_AR_LIMIT)),
    db
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("tenant_id", tenantId)
      .limit(500),
  ]);

  for (const [label, res] of [
    ["payroll_periods", periodsRes],
    ["payroll_runs", runsRes],
    ["payroll_run_lines", linesRes],
    ["compensation_commission_entries", commissionRes],
    ["compensation_plans", plansRes],
    ["compensation_plan_assignments", assignmentsRes],
    ["compensation_audit_events", auditRes],
    ["payroll_exports", exportsRes],
    ["payments", paymentsRes],
    ["ar_credit_control", arRes],
    ["v_labs_credit", labsRes],
    ["profiles", profilesRes],
  ]) {
    if (res.error) readError(label, res.error);
  }

  return {
    tenantId,
    payrollPeriods: periodsRes.data || [],
    payrollRuns: runsRes.data || [],
    payrollRunLines: linesRes.data || [],
    commissionEntries: commissionRes.data || [],
    compensationPlans: plansRes.data || [],
    planAssignments: assignmentsRes.data || [],
    auditEvents: auditRes.data || [],
    payrollExports: exportsRes.data || [],
    payments: paymentsRes.data || [],
    arRows: arRes.data || [],
    labs: labsRes.data || [],
    profiles: profilesRes.data || [],
    readHealth: {
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      bounded: true,
      tables: [
        "payroll_periods",
        "payroll_runs",
        "payroll_run_lines",
        "compensation_commission_entries",
        "compensation_plans",
        "compensation_plan_assignments",
        "compensation_audit_events",
        "payroll_exports",
        "payments",
        "ar_credit_control",
        "v_labs_credit",
        "profiles",
      ],
    },
  };
}
