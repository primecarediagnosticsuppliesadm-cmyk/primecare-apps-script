import { supabase } from "@/api/supabaseClient.js";
import {
  buildPayrollAdjustment,
  buildPayrollExportModel,
  buildPayrollTransition,
  PAYROLL_ACTIONS,
  PAYROLL_DOMAIN_RULE_VERSION,
  PAYROLL_EXPORT_FORMATS,
  PAYROLL_STATUSES,
  assertPayrollExportAllowed,
  assertPayrollPermission,
  isPayrollImmutableStatus,
  signedAdjustmentAmount,
} from "@/payroll/payrollDomainWorkflow.js";

const PAYROLL_RUN_COLUMNS =
  "id,tenant_id,period_id,run_number,status,generated_by,generated_at,submitted_by,submitted_at,approved_by,approved_at,locked_by,locked_at,exported_by,exported_at,totals_json,metadata,created_at,updated_at";
const PAYROLL_PERIOD_COLUMNS =
  "id,tenant_id,period_ym,period_start,period_end,pay_date,status,submitted_by,submitted_at,approved_by,approved_at,locked_by,locked_at,exported_by,exported_at,metadata";
const PAYROLL_LINE_COLUMNS =
  "id,tenant_id,payroll_run_id,period_id,agent_id,agent_name,profile_user_id,salary_amount,fuel_allowance,mobile_allowance,commission_amount,manual_adjustments_total,penalties_total,recoveries_total,gross_pay,deductions_total,net_payable,line_status,calculation_snapshot,metadata";
const ADJUSTMENT_COLUMNS =
  "id,tenant_id,period_id,payroll_run_id,payroll_run_line_id,agent_id,agent_name,profile_user_id,adjustment_type,component,amount,reason,notes,requested_by,approved_by,approved_at,status,metadata";

function str(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

function nowIso(value) {
  return value || new Date().toISOString();
}

function ensureClient(client = supabase) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

function failResult(error) {
  return {
    success: false,
    error: error?.message || String(error || "payroll workflow failed"),
    data: null,
  };
}

function actorFromOptions(options = {}) {
  return {
    userId: options.actorUserId || options.actor_user_id || null,
    role: options.actorRole || options.actor_role || "",
    agentId: options.actorAgentId || options.actor_agent_id || "",
  };
}

function checksumFor(value) {
  const input = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return `pc-${Math.abs(hash).toString(16)}`;
}

async function readPayrollRun(client, { tenantId, payrollRunId }) {
  const { data, error } = await client
    .from("payroll_runs")
    .select(PAYROLL_RUN_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", payrollRunId)
    .maybeSingle();
  if (error) throw new Error(`payroll_runs read failed: ${error.message}`);
  if (!data) throw new Error("Payroll run not found");
  return data;
}

async function readPayrollPeriod(client, { tenantId, periodId }) {
  const { data, error } = await client
    .from("payroll_periods")
    .select(PAYROLL_PERIOD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Error(`payroll_periods read failed: ${error.message}`);
  if (!data) throw new Error("Payroll period not found");
  return data;
}

async function readPayrollLines(client, { tenantId, payrollRunId }) {
  const { data, error } = await client
    .from("payroll_run_lines")
    .select(PAYROLL_LINE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("payroll_run_id", payrollRunId)
    .order("agent_name", { ascending: true });
  if (error) throw new Error(`payroll_run_lines read failed: ${error.message}`);
  return data || [];
}

async function readAdjustment(client, { tenantId, adjustmentId }) {
  const { data, error } = await client
    .from("compensation_adjustments")
    .select(ADJUSTMENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", adjustmentId)
    .maybeSingle();
  if (error) throw new Error(`compensation_adjustments read failed: ${error.message}`);
  if (!data) throw new Error("Compensation adjustment not found");
  return data;
}

async function nextRunNumber(client, sourceRun) {
  const { data, error } = await client
    .from("payroll_runs")
    .select("run_number")
    .eq("tenant_id", sourceRun.tenant_id)
    .eq("period_id", sourceRun.period_id)
    .order("run_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`payroll_runs version read failed: ${error.message}`);
  return Number(data?.[0]?.run_number || 0) + 1;
}

async function insertAuditEvent(client, event) {
  const { error } = await client.from("compensation_audit_events").insert([event]);
  if (error) throw new Error(`compensation_audit_events insert failed: ${error.message}`);
}

async function insertApprovalEvent(client, event) {
  const { error } = await client.from("compensation_approval_events").insert([event]);
  if (error) throw new Error(`compensation_approval_events insert failed: ${error.message}`);
}

function stampForAction(action, actor, at) {
  if (action === PAYROLL_ACTIONS.SUBMIT) return { submitted_by: actor.userId, submitted_at: at };
  if (action === PAYROLL_ACTIONS.APPROVE) return { approved_by: actor.userId, approved_at: at };
  if (action === PAYROLL_ACTIONS.LOCK) return { locked_by: actor.userId, locked_at: at };
  if (action === PAYROLL_ACTIONS.EXPORT) return { exported_by: actor.userId, exported_at: at };
  return {};
}

async function writeWorkflowEvents(client, { run, actor, action, transition, reason, notes, at, extra = {} }) {
  const auditPayload = {
    tenant_id: run.tenant_id,
    event_type: action,
    entity_type: "payroll_run",
    entity_id: run.id,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    before_json: {
      status: transition.fromStatus,
      run_number: run.run_number,
    },
    after_json: {
      status: transition.toStatus,
      creates_new_run_version: transition.createsNewRunVersion,
      rule_version: PAYROLL_DOMAIN_RULE_VERSION,
      ...extra,
    },
    reason,
    metadata: {
      phase: "phase3c_payroll_domain",
      finance_o2c_mutation: false,
    },
  };
  await insertAuditEvent(client, auditPayload);
  if (action !== PAYROLL_ACTIONS.PREVIEW) {
    await insertApprovalEvent(client, {
      tenant_id: run.tenant_id,
      payroll_run_id: run.id,
      payroll_run_line_id: null,
      action,
      actor_user_id: actor.userId,
      actor_role: actor.role,
      reason,
      notes: notes || null,
      metadata: {
        rule_version: PAYROLL_DOMAIN_RULE_VERSION,
        finance_o2c_mutation: false,
        ...extra,
      },
    });
  }
}

async function updateDetailStatusesBeforeRunLock(client, { run, nextStatus }) {
  if (![PAYROLL_STATUSES.PREVIEWED, PAYROLL_STATUSES.SUBMITTED, PAYROLL_STATUSES.APPROVED, PAYROLL_STATUSES.LOCKED].includes(nextStatus)) {
    return;
  }
  const lineUpdate = await client
    .from("payroll_run_lines")
    .update({ line_status: nextStatus })
    .eq("tenant_id", run.tenant_id)
    .eq("payroll_run_id", run.id);
  if (lineUpdate.error) throw new Error(`payroll_run_lines status update failed: ${lineUpdate.error.message}`);

  const commissionUpdate = await client
    .from("compensation_commission_entries")
    .update({ status: nextStatus })
    .eq("tenant_id", run.tenant_id)
    .eq("period_id", run.period_id)
    .eq("metadata->>payroll_run_id", run.id);
  if (commissionUpdate.error) {
    throw new Error(`compensation_commission_entries status update failed: ${commissionUpdate.error.message}`);
  }
}

async function updateRunAndPeriodStatus(client, { run, period, action, nextStatus, actor, at, metadata = {} }) {
  const stamp = stampForAction(action, actor, at);
  const runMetadata = {
    ...(run.metadata || {}),
    ...metadata,
    last_workflow_action: action,
    workflow_rule_version: PAYROLL_DOMAIN_RULE_VERSION,
    finance_o2c_mutation: false,
  };
  const runUpdate = await client
    .from("payroll_runs")
    .update({
      status: nextStatus,
      ...stamp,
      metadata: runMetadata,
    })
    .eq("tenant_id", run.tenant_id)
    .eq("id", run.id);
  if (runUpdate.error) throw new Error(`payroll_runs status update failed: ${runUpdate.error.message}`);

  const periodUpdate = await client
    .from("payroll_periods")
    .update({
      status: nextStatus,
      ...stamp,
      metadata: {
        ...(period.metadata || {}),
        ...metadata,
        last_workflow_action: action,
        workflow_rule_version: PAYROLL_DOMAIN_RULE_VERSION,
        finance_o2c_mutation: false,
      },
    })
    .eq("tenant_id", period.tenant_id)
    .eq("id", period.id);
  if (periodUpdate.error) {
    throw new Error(`payroll_periods status update failed: ${periodUpdate.error.message}`);
  }
}

async function payrollTransitionWrite(options = {}) {
  const client = ensureClient(options.client);
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const payrollRunId = str(options.payrollRunId ?? options.payroll_run_id);
  const action = str(options.action);
  const actor = actorFromOptions(options);
  const reason = str(options.reason) || `${action}_payroll_run`;
  const at = nowIso(options.at);
  if (!tenantId || !payrollRunId || !action) {
    throw new Error("tenantId, payrollRunId, and action are required");
  }

  const run = await readPayrollRun(client, { tenantId, payrollRunId });
  const period = await readPayrollPeriod(client, { tenantId, periodId: run.period_id });
  const transition = buildPayrollTransition({ payrollRun: run, action, actor, reason, at });

  await updateDetailStatusesBeforeRunLock(client, { run, nextStatus: transition.toStatus });
  await updateRunAndPeriodStatus(client, {
    run,
    period,
    action,
    nextStatus: transition.toStatus,
    actor,
    at,
    metadata: options.metadata || {},
  });
  await writeWorkflowEvents(client, {
    run,
    actor,
    action,
    transition,
    reason,
    notes: options.notes,
    at,
  });

  return {
    payrollRunId: run.id,
    periodId: run.period_id,
    fromStatus: transition.fromStatus,
    toStatus: transition.toStatus,
    action,
    at,
    ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
  };
}

export async function previewPayrollRunWrite(options = {}) {
  try {
    const data = await payrollTransitionWrite({ ...options, action: PAYROLL_ACTIONS.PREVIEW });
    return { success: true, error: null, data };
  } catch (error) {
    return failResult(error);
  }
}

export async function submitPayrollRunWrite(options = {}) {
  try {
    const data = await payrollTransitionWrite({ ...options, action: PAYROLL_ACTIONS.SUBMIT });
    return { success: true, error: null, data };
  } catch (error) {
    return failResult(error);
  }
}

export async function approvePayrollRunWrite(options = {}) {
  try {
    const data = await payrollTransitionWrite({ ...options, action: PAYROLL_ACTIONS.APPROVE });
    return { success: true, error: null, data };
  } catch (error) {
    return failResult(error);
  }
}

export async function rejectPayrollRunWrite(options = {}) {
  try {
    const data = await payrollTransitionWrite({ ...options, action: PAYROLL_ACTIONS.REJECT });
    return { success: true, error: null, data };
  } catch (error) {
    return failResult(error);
  }
}

export async function lockPayrollRunWrite(options = {}) {
  try {
    const data = await payrollTransitionWrite({ ...options, action: PAYROLL_ACTIONS.LOCK });
    return { success: true, error: null, data };
  } catch (error) {
    return failResult(error);
  }
}

export async function generatePayrollExportWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const payrollRunId = str(options.payrollRunId ?? options.payroll_run_id);
    const format = str(options.format || PAYROLL_EXPORT_FORMATS.CSV);
    const actor = actorFromOptions(options);
    const reason = str(options.reason) || "export_payroll_run";
    const at = nowIso(options.at);
    const run = await readPayrollRun(client, { tenantId, payrollRunId });
    const period = await readPayrollPeriod(client, { tenantId, periodId: run.period_id });
    assertPayrollExportAllowed({ payrollRun: run, actor, format });
    const lines = await readPayrollLines(client, { tenantId, payrollRunId });
    const exportModel = buildPayrollExportModel({
      payrollRun: { ...run, period_ym: period.period_ym },
      payrollRunLines: lines,
      format,
      generatedAt: at,
    });
    const checksum = checksumFor(exportModel);

    const exportInsert = await client
      .from("payroll_exports")
      .insert([
        {
          tenant_id: run.tenant_id,
          payroll_run_id: run.id,
          period_id: run.period_id,
          export_format: format,
          storage_path: options.storagePath || null,
          checksum,
          generated_by: actor.userId,
          generated_at: at,
          status: "generated",
          metadata: {
            rule_version: PAYROLL_DOMAIN_RULE_VERSION,
            export_model: exportModel,
            finance_o2c_mutation: false,
            no_bank_file_created: true,
            no_gl_posting_created: true,
          },
        },
      ])
      .select("id")
      .single();
    if (exportInsert.error) {
      throw new Error(`payroll_exports insert failed: ${exportInsert.error.message}`);
    }

    const transition = buildPayrollTransition({
      payrollRun: run,
      action: PAYROLL_ACTIONS.EXPORT,
      actor,
      reason,
      at,
    });
    await updateRunAndPeriodStatus(client, {
      run,
      period,
      action: PAYROLL_ACTIONS.EXPORT,
      nextStatus: PAYROLL_STATUSES.EXPORTED,
      actor,
      at,
      metadata: { export_id: exportInsert.data.id, export_checksum: checksum },
    });
    await writeWorkflowEvents(client, {
      run,
      actor,
      action: PAYROLL_ACTIONS.EXPORT,
      transition,
      reason,
      notes: options.notes,
      at,
      extra: { export_id: exportInsert.data.id, checksum, format },
    });

    return {
      success: true,
      error: null,
      data: {
        payrollRunId: run.id,
        exportId: exportInsert.data.id,
        checksum,
        format,
        status: PAYROLL_STATUSES.EXPORTED,
        exportModel,
        ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export async function recordPayrollPaidWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const payrollRunId = str(options.payrollRunId ?? options.payroll_run_id);
    const actor = actorFromOptions(options);
    const reason = str(options.reason) || "payroll_paid_evidence_recorded";
    const at = nowIso(options.at);
    const run = await readPayrollRun(client, { tenantId, payrollRunId });
    const period = await readPayrollPeriod(client, { tenantId, periodId: run.period_id });
    const transition = buildPayrollTransition({
      payrollRun: run,
      action: PAYROLL_ACTIONS.PAY,
      actor,
      reason,
      at,
    });
    const paidEvidence = {
      paid_at: at,
      paid_by: actor.userId,
      payment_reference: options.paymentReference || options.payment_reference || null,
      evidence_notes: options.notes || null,
      finance_o2c_mutation: false,
      no_payment_row_created: true,
      no_bank_disbursement_created: true,
      no_gl_posting_created: true,
    };
    await updateRunAndPeriodStatus(client, {
      run,
      period,
      action: PAYROLL_ACTIONS.PAY,
      nextStatus: PAYROLL_STATUSES.PAID,
      actor,
      at,
      metadata: { paid_evidence: paidEvidence },
    });
    await writeWorkflowEvents(client, {
      run,
      actor,
      action: PAYROLL_ACTIONS.PAY,
      transition,
      reason,
      notes: options.notes,
      at,
      extra: { paid_evidence: paidEvidence },
    });

    return {
      success: true,
      error: null,
      data: {
        payrollRunId: run.id,
        fromStatus: transition.fromStatus,
        toStatus: PAYROLL_STATUSES.PAID,
        paidEvidence,
        ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export async function reopenPayrollRunWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const payrollRunId = str(options.payrollRunId ?? options.payroll_run_id);
    const actor = actorFromOptions(options);
    const reason = str(options.reason) || "reopen_payroll_as_new_draft_version";
    const at = nowIso(options.at);
    const sourceRun = await readPayrollRun(client, { tenantId, payrollRunId });
    const transition = buildPayrollTransition({
      payrollRun: sourceRun,
      action: PAYROLL_ACTIONS.REOPEN,
      actor,
      reason,
      at,
    });
    const nextNumber = await nextRunNumber(client, sourceRun);
    const runInsert = await client
      .from("payroll_runs")
      .insert([
        {
          tenant_id: sourceRun.tenant_id,
          period_id: sourceRun.period_id,
          run_number: nextNumber,
          status: PAYROLL_STATUSES.DRAFT,
          generated_by: actor.userId,
          generated_at: at,
          totals_json: sourceRun.totals_json || {},
          metadata: {
            ...(sourceRun.metadata || {}),
            reopened_from_payroll_run_id: sourceRun.id,
            reopened_from_status: sourceRun.status,
            reopened_at: at,
            reopened_by: actor.userId,
            reopen_reason: reason,
            workflow_rule_version: PAYROLL_DOMAIN_RULE_VERSION,
            finance_o2c_mutation: false,
          },
        },
      ])
      .select("id")
      .single();
    if (runInsert.error) throw new Error(`payroll_runs reopen insert failed: ${runInsert.error.message}`);

    const sourceLines = await readPayrollLines(client, { tenantId, payrollRunId });
    const clonedLines = sourceLines.map((line) => ({
      tenant_id: line.tenant_id,
      payroll_run_id: runInsert.data.id,
      period_id: line.period_id,
      agent_id: line.agent_id,
      agent_name: line.agent_name,
      profile_user_id: line.profile_user_id,
      salary_amount: line.salary_amount,
      fuel_allowance: line.fuel_allowance,
      mobile_allowance: line.mobile_allowance,
      commission_amount: line.commission_amount,
      manual_adjustments_total: line.manual_adjustments_total,
      penalties_total: line.penalties_total,
      recoveries_total: line.recoveries_total,
      gross_pay: line.gross_pay,
      deductions_total: line.deductions_total,
      net_payable: line.net_payable,
      line_status: PAYROLL_STATUSES.DRAFT,
      calculation_snapshot: line.calculation_snapshot || {},
      metadata: {
        ...(line.metadata || {}),
        reopened_from_payroll_run_line_id: line.id,
        payroll_run_id: runInsert.data.id,
        workflow_rule_version: PAYROLL_DOMAIN_RULE_VERSION,
      },
    }));
    if (clonedLines.length) {
      const lineInsert = await client.from("payroll_run_lines").insert(clonedLines);
      if (lineInsert.error) {
        throw new Error(`payroll_run_lines reopen insert failed: ${lineInsert.error.message}`);
      }
    }
    await writeWorkflowEvents(client, {
      run: sourceRun,
      actor,
      action: PAYROLL_ACTIONS.REOPEN,
      transition,
      reason,
      notes: options.notes,
      at,
      extra: { new_payroll_run_id: runInsert.data.id, new_run_number: nextNumber },
    });

    return {
      success: true,
      error: null,
      data: {
        sourcePayrollRunId: sourceRun.id,
        newPayrollRunId: runInsert.data.id,
        newRunNumber: nextNumber,
        status: PAYROLL_STATUSES.DRAFT,
        ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export async function createPayrollAdjustmentWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const actor = actorFromOptions(options);
    const adjustment = buildPayrollAdjustment({
      adjustment: options.adjustment || options,
      actor,
      defaultStatus: options.submit ? PAYROLL_STATUSES.SUBMITTED : PAYROLL_STATUSES.DRAFT,
      at: options.at,
    });
    if (adjustment.payroll_run_id) {
      const run = await readPayrollRun(client, {
        tenantId: adjustment.tenant_id,
        payrollRunId: adjustment.payroll_run_id,
      });
      if (isPayrollImmutableStatus(run.status)) {
        throw new Error("payroll_adjustment_blocked_after_lock");
      }
    }
    const inserted = await client
      .from("compensation_adjustments")
      .insert([adjustment])
      .select("id")
      .single();
    if (inserted.error) {
      throw new Error(`compensation_adjustments insert failed: ${inserted.error.message}`);
    }
    await insertAuditEvent(client, {
      tenant_id: adjustment.tenant_id,
      event_type: "adjustment_requested",
      entity_type: "compensation_adjustment",
      entity_id: inserted.data.id,
      actor_user_id: actor.userId,
      actor_role: actor.role,
      before_json: null,
      after_json: adjustment,
      reason: adjustment.reason,
      metadata: { rule_version: PAYROLL_DOMAIN_RULE_VERSION, finance_o2c_mutation: false },
    });
    return {
      success: true,
      error: null,
      data: {
        adjustmentId: inserted.data.id,
        status: adjustment.status,
        ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
      },
    };
  } catch (error) {
    return failResult(error);
  }
}

export async function submitPayrollAdjustmentWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const adjustmentId = str(options.adjustmentId ?? options.adjustment_id);
    const actor = actorFromOptions(options);
    assertPayrollPermission(actor.role, PAYROLL_ACTIONS.ADJUSTMENT_SUBMIT);
    const adjustment = await readAdjustment(client, { tenantId, adjustmentId });
    if (adjustment.status !== PAYROLL_STATUSES.DRAFT) {
      throw new Error("payroll_adjustment_submit_requires_draft");
    }
    const updated = await client
      .from("compensation_adjustments")
      .update({
        status: PAYROLL_STATUSES.SUBMITTED,
        metadata: {
          ...(adjustment.metadata || {}),
          submitted_at: nowIso(options.at),
          submitted_by: actor.userId,
          rule_version: PAYROLL_DOMAIN_RULE_VERSION,
        },
      })
      .eq("tenant_id", tenantId)
      .eq("id", adjustmentId);
    if (updated.error) throw new Error(`compensation_adjustments submit failed: ${updated.error.message}`);
    return { success: true, error: null, data: { adjustmentId, status: PAYROLL_STATUSES.SUBMITTED } };
  } catch (error) {
    return failResult(error);
  }
}

export async function approvePayrollAdjustmentWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const adjustmentId = str(options.adjustmentId ?? options.adjustment_id);
    const actor = actorFromOptions(options);
    assertPayrollPermission(actor.role, PAYROLL_ACTIONS.ADJUSTMENT_APPROVE);
    const adjustment = await readAdjustment(client, { tenantId, adjustmentId });
    if (adjustment.status !== PAYROLL_STATUSES.SUBMITTED) {
      throw new Error("payroll_adjustment_approval_requires_submitted");
    }
    if (adjustment.payroll_run_id) {
      const run = await readPayrollRun(client, { tenantId, payrollRunId: adjustment.payroll_run_id });
      if (isPayrollImmutableStatus(run.status)) {
        throw new Error("payroll_adjustment_approval_blocked_after_lock");
      }
    }

    if (adjustment.payroll_run_line_id) {
      const lineRead = await client
        .from("payroll_run_lines")
        .select(PAYROLL_LINE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("id", adjustment.payroll_run_line_id)
        .maybeSingle();
      if (lineRead.error) throw new Error(`payroll_run_lines adjustment read failed: ${lineRead.error.message}`);
      const line = lineRead.data;
      if (!line) throw new Error("Payroll run line not found for adjustment");
      const effect = signedAdjustmentAmount({
        adjustmentType: adjustment.adjustment_type,
        amount: adjustment.amount,
      });
      const isDeduction = effect < 0;
      const lineUpdate = await client
        .from("payroll_run_lines")
        .update({
          manual_adjustments_total: isDeduction
            ? money(line.manual_adjustments_total)
            : money(line.manual_adjustments_total + effect),
          penalties_total: isDeduction
            ? money(line.penalties_total + Math.abs(effect))
            : money(line.penalties_total),
          recoveries_total:
            adjustment.adjustment_type === "recovery"
              ? money(line.recoveries_total + Math.abs(effect))
              : money(line.recoveries_total),
          gross_pay: isDeduction ? money(line.gross_pay) : money(line.gross_pay + effect),
          deductions_total: isDeduction
            ? money(line.deductions_total + Math.abs(effect))
            : money(line.deductions_total),
          net_payable: money(line.net_payable + effect),
          metadata: {
            ...(line.metadata || {}),
            last_adjustment_id: adjustment.id,
            workflow_rule_version: PAYROLL_DOMAIN_RULE_VERSION,
          },
        })
        .eq("tenant_id", tenantId)
        .eq("id", adjustment.payroll_run_line_id);
      if (lineUpdate.error) {
        throw new Error(`payroll_run_lines adjustment update failed: ${lineUpdate.error.message}`);
      }
    }

    const at = nowIso(options.at);
    const adjustmentUpdate = await client
      .from("compensation_adjustments")
      .update({
        status: PAYROLL_STATUSES.APPROVED,
        approved_by: actor.userId,
        approved_at: at,
        metadata: {
          ...(adjustment.metadata || {}),
          approved_at: at,
          approved_by: actor.userId,
          rule_version: PAYROLL_DOMAIN_RULE_VERSION,
          finance_o2c_mutation: false,
        },
      })
      .eq("tenant_id", tenantId)
      .eq("id", adjustmentId);
    if (adjustmentUpdate.error) {
      throw new Error(`compensation_adjustments approval failed: ${adjustmentUpdate.error.message}`);
    }
    await insertAuditEvent(client, {
      tenant_id: tenantId,
      event_type: "adjustment_approved",
      entity_type: "compensation_adjustment",
      entity_id: adjustmentId,
      actor_user_id: actor.userId,
      actor_role: actor.role,
      before_json: adjustment,
      after_json: { status: PAYROLL_STATUSES.APPROVED },
      reason: options.reason || adjustment.reason,
      metadata: { rule_version: PAYROLL_DOMAIN_RULE_VERSION, finance_o2c_mutation: false },
    });
    return { success: true, error: null, data: { adjustmentId, status: PAYROLL_STATUSES.APPROVED } };
  } catch (error) {
    return failResult(error);
  }
}

export async function rejectPayrollAdjustmentWrite(options = {}) {
  try {
    const client = ensureClient(options.client);
    const tenantId = str(options.tenantId ?? options.tenant_id);
    const adjustmentId = str(options.adjustmentId ?? options.adjustment_id);
    const actor = actorFromOptions(options);
    assertPayrollPermission(actor.role, PAYROLL_ACTIONS.ADJUSTMENT_REJECT);
    const adjustment = await readAdjustment(client, { tenantId, adjustmentId });
    if (adjustment.status !== PAYROLL_STATUSES.SUBMITTED) {
      throw new Error("payroll_adjustment_reject_requires_submitted");
    }
    const reason = str(options.reason) || "adjustment_rejected";
    const updated = await client
      .from("compensation_adjustments")
      .update({
        status: "rejected",
        metadata: {
          ...(adjustment.metadata || {}),
          rejected_at: nowIso(options.at),
          rejected_by: actor.userId,
          rejection_reason: reason,
          rule_version: PAYROLL_DOMAIN_RULE_VERSION,
        },
      })
      .eq("tenant_id", tenantId)
      .eq("id", adjustmentId);
    if (updated.error) throw new Error(`compensation_adjustments reject failed: ${updated.error.message}`);
    await insertAuditEvent(client, {
      tenant_id: tenantId,
      event_type: "adjustment_rejected",
      entity_type: "compensation_adjustment",
      entity_id: adjustmentId,
      actor_user_id: actor.userId,
      actor_role: actor.role,
      before_json: adjustment,
      after_json: { status: "rejected" },
      reason,
      metadata: { rule_version: PAYROLL_DOMAIN_RULE_VERSION, finance_o2c_mutation: false },
    });
    return { success: true, error: null, data: { adjustmentId, status: "rejected" } };
  } catch (error) {
    return failResult(error);
  }
}
