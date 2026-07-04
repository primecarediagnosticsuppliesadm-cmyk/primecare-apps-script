import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_AR_COLUMNS,
  HQ_COLLECTIONS_AR_LIMIT,
  HQ_PAYMENT_COLUMNS,
  HQ_PAYMENTS_RECENT_LIMIT,
  clampLimit,
} from "@/api/hqReadBounds.js";
import {
  calculateCompensationPreview,
  COMPENSATION_RULE_VERSION,
} from "@/compensation/compensationCalculationEngine.js";

const COMPENSATION_PLAN_COLUMNS =
  "id,tenant_id,plan_code,version,role_scope,effective_from,effective_to,base_salary,fuel_allowance,mobile_allowance,commission_rate_bps,promotion_salary,promotion_commission_rate_bps,promotion_collection_threshold,promotion_min_efficiency_pct,promotion_max_overdue_days,rules_json,status";
const COMPENSATION_ASSIGNMENT_COLUMNS =
  "id,tenant_id,plan_id,profile_user_id,agent_id,agent_name,assignment_status,start_date,end_date";
const PAYROLL_PERIOD_COLUMNS =
  "id,tenant_id,period_ym,period_start,period_end,status";
const ATTRIBUTION_SNAPSHOT_COLUMNS =
  "id,tenant_id,period_id,payment_id,payment_ref,payment_date,lab_id,lab_name,agent_id,agent_name,profile_user_id,attribution_method,ownership_snapshot,payment_snapshot,rule_version,source_hash,calculated_at";

function str(value) {
  return String(value ?? "").trim();
}

function msSince(start) {
  return Math.max(0, Math.round(performance.now() - start));
}

function ensureClient(client = supabase) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

function failResult(error) {
  return {
    success: false,
    error: error?.message || String(error || "compensation preview failed"),
    data: null,
  };
}

async function readPayrollPeriod(client, { tenantId, periodId, periodYm }) {
  let query = client
    .from("payroll_periods")
    .select(PAYROLL_PERIOD_COLUMNS)
    .eq("tenant_id", tenantId);
  if (periodId) query = query.eq("id", periodId);
  else query = query.eq("period_ym", periodYm);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`payroll_periods read failed: ${error.message}`);
  if (!data) throw new Error("Payroll period not found");
  return data;
}

async function readCompensationInputs(client, period) {
  const tenantId = str(period.tenant_id);
  const paymentLimit = clampLimit(HQ_PAYMENTS_RECENT_LIMIT, HQ_PAYMENTS_RECENT_LIMIT, HQ_PAYMENTS_RECENT_LIMIT);
  const arLimit = clampLimit(HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT);

  const [plans, assignments, payments, cumulativePayments, snapshots, arRows] = await Promise.all([
    client
      .from("compensation_plans")
      .select(COMPENSATION_PLAN_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", ["active", "draft"]),
    client
      .from("compensation_plan_assignments")
      .select(COMPENSATION_ASSIGNMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("assignment_status", "active"),
    client
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .gte("payment_date", period.period_start)
      .lte("payment_date", period.period_end)
      .order("payment_date", { ascending: true })
      .limit(paymentLimit),
    client
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .lte("payment_date", period.period_end)
      .order("payment_date", { ascending: true })
      .limit(paymentLimit),
    client
      .from("compensation_attribution_snapshots")
      .select(ATTRIBUTION_SNAPSHOT_COLUMNS)
      .eq("tenant_id", tenantId)
      .or(`period_id.eq.${period.id},payment_date.gte.${period.period_start}`)
      .limit(paymentLimit),
    client
      .from("ar_credit_control")
      .select(HQ_AR_COLUMNS)
      .eq("tenant_id", tenantId)
      .limit(arLimit),
  ]);

  for (const [label, res] of [
    ["compensation_plans", plans],
    ["compensation_plan_assignments", assignments],
    ["payments", payments],
    ["payments.cumulative", cumulativePayments],
    ["compensation_attribution_snapshots", snapshots],
    ["ar_credit_control", arRows],
  ]) {
    if (res.error) throw new Error(`${label} read failed: ${res.error.message}`);
  }

  return {
    compensationPlans: plans.data || [],
    planAssignments: assignments.data || [],
    payments: payments.data || [],
    cumulativePayments: cumulativePayments.data || [],
    attributionSnapshots: (snapshots.data || []).filter((row) => {
      const d = str(row.payment_date);
      return !d || (d >= str(period.period_start) && d <= str(period.period_end));
    }),
    arRows: arRows.data || [],
  };
}

async function insertAuditEvent(client, event) {
  const { error } = await client.from("compensation_audit_events").insert([event]);
  if (error) throw new Error(`compensation_audit_events insert failed: ${error.message}`);
}

async function nextRunNumber(client, period) {
  const { data, error } = await client
    .from("payroll_runs")
    .select("run_number")
    .eq("tenant_id", period.tenant_id)
    .eq("period_id", period.id)
    .order("run_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`payroll_runs version read failed: ${error.message}`);
  return Number(data?.[0]?.run_number || 0) + 1;
}

async function persistDraftPreview(client, { period, preview, actor = {}, startedAt, durationMs }) {
  const runNumber = await nextRunNumber(client, period);
  const runPayload = {
    ...preview.payrollRun,
    run_number: runNumber,
    generated_by: actor.userId || null,
    generated_at: preview.calculatedAt,
    status: "draft",
    metadata: {
      ...preview.payrollRun.metadata,
      rule_version: preview.ruleVersion,
      plan_versions: [
        ...new Set(preview.commissionEntries.map((entry) => entry.metadata?.plan_version).filter(Boolean)),
      ],
      execution_duration_ms: durationMs,
      warning_count: preview.warnings.length,
    },
  };

  const runInsert = await client.from("payroll_runs").insert([runPayload]).select("id").single();
  if (runInsert.error) throw new Error(`payroll_runs insert failed: ${runInsert.error.message}`);
  const payrollRunId = runInsert.data.id;

  const commissionRows = preview.commissionEntries.map((entry) => ({
    ...entry,
    status: "draft",
    metadata: {
      ...entry.metadata,
      payroll_run_id: payrollRunId,
      rule_version: entry.rule_version,
    },
  }));
  const commissionInsert = commissionRows.length
    ? await client
        .from("compensation_commission_entries")
        .insert(commissionRows)
        .select("id,agent_id")
    : { data: [], error: null };
  if (commissionInsert.error) {
    throw new Error(`compensation_commission_entries insert failed: ${commissionInsert.error.message}`);
  }
  const commissionIdByAgent = new Map(
    (commissionInsert.data || []).map((row) => [str(row.agent_id), row.id])
  );

  const lineRows = preview.payrollRunLines.map((line) => ({
    ...line,
    payroll_run_id: payrollRunId,
    commission_entry_id: commissionIdByAgent.get(str(line.agent_id)) || null,
    line_status: "draft",
  }));
  const lineInsert = lineRows.length
    ? await client.from("payroll_run_lines").insert(lineRows).select("id")
    : { data: [], error: null };
  if (lineInsert.error) throw new Error(`payroll_run_lines insert failed: ${lineInsert.error.message}`);

  await insertAuditEvent(client, {
    tenant_id: period.tenant_id,
    event_type: "calculation_finish",
    entity_type: "payroll_run",
    entity_id: payrollRunId,
    actor_user_id: actor.userId || null,
    actor_role: actor.role || null,
    before_json: null,
    after_json: {
      run_number: runNumber,
      rule_version: preview.ruleVersion,
      calculated_at: preview.calculatedAt,
      records_calculated: preview.payrollRunLines.length,
      warnings: preview.warnings,
      execution_duration_ms: durationMs,
      started_at: startedAt,
    },
    reason: "preview_calculation_finished",
    metadata: {
      preview_only: true,
      no_approval_event: true,
      no_export: true,
    },
  });

  return {
    payrollRunId,
    runNumber,
    commissionEntryCount: commissionRows.length,
    payrollRunLineCount: lineRows.length,
  };
}

export async function generateCompensationPreviewDraftWrite(options = {}) {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const periodId = str(options.periodId ?? options.period_id);
    const periodYm = str(options.periodYm ?? options.period_ym);
    if (!tenantId || (!periodId && !periodYm)) {
      return { success: false, error: "tenantId and periodId or periodYm are required", data: null };
    }

    const period = await readPayrollPeriod(client, { tenantId, periodId, periodYm });
    await insertAuditEvent(client, {
      tenant_id: tenantId,
      event_type: "calculation_start",
      entity_type: "payroll_period",
      entity_id: period.id,
      actor_user_id: options.actorUserId || null,
      actor_role: options.actorRole || null,
      before_json: null,
      after_json: {
        period_id: period.id,
        period_ym: period.period_ym,
        rule_version: COMPENSATION_RULE_VERSION,
        started_at: startedAt,
      },
      reason: "preview_calculation_started",
      metadata: { preview_only: true },
    });

    const inputs = await readCompensationInputs(client, period);
    const calculatedAt = new Date().toISOString();
    const preview = calculateCompensationPreview({
      period,
      ...inputs,
      calculatedAt,
    });
    const durationMs = msSince(started);
    const persisted = await persistDraftPreview(client, {
      period,
      preview,
      actor: { userId: options.actorUserId || null, role: options.actorRole || null },
      startedAt,
      durationMs,
    });

    return {
      success: true,
      error: null,
      data: {
        ...persisted,
        totals: preview.totals,
        warnings: preview.warnings,
        ruleVersion: preview.ruleVersion,
        calculatedAt,
        durationMs,
        status: "draft",
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export {
  calculateCompensationPreview,
  calculateCommissionEntries,
  calculatePayrollPreview,
  calculatePromotionEligibility,
  calculateCollectionEfficiency,
  calculateAgentCompensation,
} from "@/compensation/compensationCalculationEngine.js";

