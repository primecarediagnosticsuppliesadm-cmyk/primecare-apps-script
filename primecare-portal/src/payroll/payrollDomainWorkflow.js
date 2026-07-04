/**
 * PrimeCare payroll domain workflow.
 *
 * Pure domain helpers only. This module does not read Supabase, calculate
 * commissions, create payouts, create accounting records, or mutate Finance/O2C.
 */

export const PAYROLL_DOMAIN_RULE_VERSION = "PC_PAYROLL_DOMAIN_2026_PHASE3C";

export const PAYROLL_STATUSES = Object.freeze({
  DRAFT: "draft",
  PREVIEWED: "previewed",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  LOCKED: "locked",
  EXPORTED: "exported",
  PAID: "paid",
  VOID: "void",
});

export const PAYROLL_ACTIONS = Object.freeze({
  PREVIEW: "preview",
  SUBMIT: "submit",
  APPROVE: "approve",
  REJECT: "reject",
  LOCK: "lock",
  EXPORT: "export",
  PAY: "pay",
  REOPEN: "reopen",
  ADJUSTMENT_CREATE: "adjustment_create",
  ADJUSTMENT_SUBMIT: "adjustment_submit",
  ADJUSTMENT_APPROVE: "adjustment_approve",
  ADJUSTMENT_REJECT: "adjustment_reject",
  READ: "read",
});

export const PAYROLL_ROLES = Object.freeze({
  EXECUTIVE: "executive",
  HR: "hr",
  ADMIN: "admin",
  AGENT: "agent",
});

export const PAYROLL_EXPORT_FORMATS = Object.freeze({
  CSV: "csv",
  EXCEL: "excel",
  ACCOUNTING_READY: "accounting_ready",
});

export const PAYROLL_ADJUSTMENT_TYPES = Object.freeze({
  POSITIVE: "positive",
  NEGATIVE: "negative",
  RECOVERY: "recovery",
  ADVANCE: "advance",
  CORRECTION: "correction",
});

const IMMUTABLE_STATUSES = new Set([
  PAYROLL_STATUSES.LOCKED,
  PAYROLL_STATUSES.EXPORTED,
  PAYROLL_STATUSES.PAID,
]);

const AGENT_VISIBLE_STATUSES = new Set([
  PAYROLL_STATUSES.LOCKED,
  PAYROLL_STATUSES.EXPORTED,
  PAYROLL_STATUSES.PAID,
]);

const ACTION_PERMISSION_BY_ROLE = Object.freeze({
  [PAYROLL_ROLES.EXECUTIVE]: new Set([
    PAYROLL_ACTIONS.PREVIEW,
    PAYROLL_ACTIONS.SUBMIT,
    PAYROLL_ACTIONS.APPROVE,
    PAYROLL_ACTIONS.REJECT,
    PAYROLL_ACTIONS.LOCK,
    PAYROLL_ACTIONS.EXPORT,
    PAYROLL_ACTIONS.PAY,
    PAYROLL_ACTIONS.REOPEN,
    PAYROLL_ACTIONS.ADJUSTMENT_CREATE,
    PAYROLL_ACTIONS.ADJUSTMENT_SUBMIT,
    PAYROLL_ACTIONS.ADJUSTMENT_APPROVE,
    PAYROLL_ACTIONS.ADJUSTMENT_REJECT,
    PAYROLL_ACTIONS.READ,
  ]),
  [PAYROLL_ROLES.HR]: new Set([
    PAYROLL_ACTIONS.PREVIEW,
    PAYROLL_ACTIONS.SUBMIT,
    PAYROLL_ACTIONS.ADJUSTMENT_CREATE,
    PAYROLL_ACTIONS.ADJUSTMENT_SUBMIT,
    PAYROLL_ACTIONS.READ,
  ]),
  [PAYROLL_ROLES.ADMIN]: new Set([PAYROLL_ACTIONS.READ]),
  [PAYROLL_ROLES.AGENT]: new Set([PAYROLL_ACTIONS.READ]),
});

const STATUS_TRANSITIONS = Object.freeze({
  [PAYROLL_ACTIONS.PREVIEW]: {
    from: [PAYROLL_STATUSES.DRAFT],
    to: PAYROLL_STATUSES.PREVIEWED,
  },
  [PAYROLL_ACTIONS.SUBMIT]: {
    from: [PAYROLL_STATUSES.PREVIEWED],
    to: PAYROLL_STATUSES.SUBMITTED,
  },
  [PAYROLL_ACTIONS.APPROVE]: {
    from: [PAYROLL_STATUSES.SUBMITTED],
    to: PAYROLL_STATUSES.APPROVED,
  },
  [PAYROLL_ACTIONS.REJECT]: {
    from: [PAYROLL_STATUSES.SUBMITTED],
    to: PAYROLL_STATUSES.DRAFT,
  },
  [PAYROLL_ACTIONS.LOCK]: {
    from: [PAYROLL_STATUSES.APPROVED],
    to: PAYROLL_STATUSES.LOCKED,
  },
  [PAYROLL_ACTIONS.EXPORT]: {
    from: [PAYROLL_STATUSES.LOCKED],
    to: PAYROLL_STATUSES.EXPORTED,
  },
  [PAYROLL_ACTIONS.PAY]: {
    from: [PAYROLL_STATUSES.EXPORTED],
    to: PAYROLL_STATUSES.PAID,
  },
});

const EXPORT_COLUMNS = Object.freeze([
  "period_ym",
  "payroll_run_id",
  "agent_id",
  "agent_name",
  "salary_amount",
  "fuel_allowance",
  "mobile_allowance",
  "commission_amount",
  "manual_adjustments_total",
  "penalties_total",
  "recoveries_total",
  "gross_pay",
  "deductions_total",
  "net_payable",
  "line_status",
]);

function str(value) {
  return String(value ?? "").trim();
}

function roleKey(role) {
  return str(role).toLowerCase();
}

function statusKey(status) {
  return str(status).toLowerCase() || PAYROLL_STATUSES.DRAFT;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function nowIso(value) {
  return value || new Date().toISOString();
}

function requireReason(action, reason) {
  if (!str(reason)) {
    throw new Error(`payroll_${action}_reason_required`);
  }
}

function normalizeLine(line = {}) {
  return {
    period_ym: str(line.period_ym ?? line.periodYm),
    payroll_run_id: str(line.payroll_run_id ?? line.payrollRunId),
    agent_id: str(line.agent_id ?? line.agentId),
    agent_name: str(line.agent_name ?? line.agentName),
    salary_amount: money(line.salary_amount ?? line.salaryAmount),
    fuel_allowance: money(line.fuel_allowance ?? line.fuelAllowance),
    mobile_allowance: money(line.mobile_allowance ?? line.mobileAllowance),
    commission_amount: money(line.commission_amount ?? line.commissionAmount),
    manual_adjustments_total: money(
      line.manual_adjustments_total ?? line.manualAdjustmentsTotal
    ),
    penalties_total: money(line.penalties_total ?? line.penaltiesTotal),
    recoveries_total: money(line.recoveries_total ?? line.recoveriesTotal),
    gross_pay: money(line.gross_pay ?? line.grossPay),
    deductions_total: money(line.deductions_total ?? line.deductionsTotal),
    net_payable: money(line.net_payable ?? line.netPayable),
    line_status: statusKey(line.line_status ?? line.lineStatus),
  };
}

export function isPayrollImmutableStatus(status) {
  return IMMUTABLE_STATUSES.has(statusKey(status));
}

export function isPayrollAgentVisibleStatus(status) {
  return AGENT_VISIBLE_STATUSES.has(statusKey(status));
}

export function canPerformPayrollAction(role, action) {
  return Boolean(ACTION_PERMISSION_BY_ROLE[roleKey(role)]?.has(str(action)));
}

export function assertPayrollPermission(role, action) {
  if (!canPerformPayrollAction(role, action)) {
    throw new Error(`payroll_${action}_forbidden_for_${roleKey(role) || "unknown"}`);
  }
  return true;
}

export function assertPayrollReadAccess({ role, runStatus, actorAgentId, rowAgentId } = {}) {
  assertPayrollPermission(role, PAYROLL_ACTIONS.READ);
  if (roleKey(role) !== PAYROLL_ROLES.AGENT) return true;
  if (!isPayrollAgentVisibleStatus(runStatus)) {
    throw new Error("payroll_agent_read_requires_locked_exported_or_paid");
  }
  if (str(actorAgentId) !== str(rowAgentId)) {
    throw new Error("payroll_agent_read_own_rows_only");
  }
  return true;
}

export function nextPayrollStatus({ currentStatus, action } = {}) {
  const transition = STATUS_TRANSITIONS[str(action)];
  if (!transition) throw new Error(`payroll_unknown_transition_${str(action)}`);
  const current = statusKey(currentStatus);
  if (!transition.from.includes(current)) {
    throw new Error(`payroll_invalid_transition_${current}_to_${transition.to}`);
  }
  return transition.to;
}

export function buildPayrollTransition({
  payrollRun = {},
  action,
  actor = {},
  reason,
  at,
} = {}) {
  const transitionAction = str(action);
  assertPayrollPermission(actor.role, transitionAction);
  if (
    [
      PAYROLL_ACTIONS.APPROVE,
      PAYROLL_ACTIONS.REJECT,
      PAYROLL_ACTIONS.LOCK,
      PAYROLL_ACTIONS.EXPORT,
      PAYROLL_ACTIONS.PAY,
      PAYROLL_ACTIONS.REOPEN,
    ].includes(transitionAction)
  ) {
    requireReason(transitionAction, reason);
  }
  if (transitionAction === PAYROLL_ACTIONS.REOPEN) {
    if (!isPayrollImmutableStatus(payrollRun.status)) {
      throw new Error("payroll_reopen_requires_locked_exported_or_paid_source");
    }
    return {
      action: transitionAction,
      fromStatus: statusKey(payrollRun.status),
      toStatus: PAYROLL_STATUSES.DRAFT,
      createsNewRunVersion: true,
      at: nowIso(at),
    };
  }
  const toStatus = nextPayrollStatus({ currentStatus: payrollRun.status, action: transitionAction });
  return {
    action: transitionAction,
    fromStatus: statusKey(payrollRun.status),
    toStatus,
    createsNewRunVersion: false,
    at: nowIso(at),
  };
}

export function normalizeAdjustmentType(type) {
  const normalized = str(type).toLowerCase();
  if (!Object.values(PAYROLL_ADJUSTMENT_TYPES).includes(normalized)) {
    throw new Error(`payroll_adjustment_type_invalid_${normalized || "empty"}`);
  }
  return normalized;
}

export function signedAdjustmentAmount({ adjustmentType, amount } = {}) {
  const type = normalizeAdjustmentType(adjustmentType);
  const abs = Math.abs(money(amount));
  if (abs <= 0) throw new Error("payroll_adjustment_amount_required");
  if ([PAYROLL_ADJUSTMENT_TYPES.NEGATIVE, PAYROLL_ADJUSTMENT_TYPES.RECOVERY].includes(type)) {
    return -abs;
  }
  if (type === PAYROLL_ADJUSTMENT_TYPES.CORRECTION) {
    const value = money(amount);
    if (value === 0) throw new Error("payroll_adjustment_amount_required");
    return value;
  }
  return abs;
}

export function buildPayrollAdjustment({
  adjustment = {},
  actor = {},
  defaultStatus = PAYROLL_STATUSES.DRAFT,
  at,
} = {}) {
  assertPayrollPermission(actor.role, PAYROLL_ACTIONS.ADJUSTMENT_CREATE);
  const adjustmentType = normalizeAdjustmentType(adjustment.adjustment_type ?? adjustment.adjustmentType);
  const reason = str(adjustment.reason);
  requireReason("adjustment", reason);
  return {
    tenant_id: str(adjustment.tenant_id ?? adjustment.tenantId),
    period_id: str(adjustment.period_id ?? adjustment.periodId) || null,
    payroll_run_id: str(adjustment.payroll_run_id ?? adjustment.payrollRunId) || null,
    payroll_run_line_id:
      str(adjustment.payroll_run_line_id ?? adjustment.payrollRunLineId) || null,
    agent_id: str(adjustment.agent_id ?? adjustment.agentId),
    agent_name: str(adjustment.agent_name ?? adjustment.agentName),
    profile_user_id: str(adjustment.profile_user_id ?? adjustment.profileUserId) || null,
    adjustment_type: adjustmentType,
    component: str(adjustment.component || "manual_adjustment"),
    amount: signedAdjustmentAmount({ adjustmentType, amount: adjustment.amount }),
    reason,
    notes: str(adjustment.notes) || null,
    requested_by: actor.userId || null,
    status: statusKey(adjustment.status || defaultStatus),
    metadata: {
      ...(adjustment.metadata || {}),
      rule_version: PAYROLL_DOMAIN_RULE_VERSION,
      requested_at: nowIso(at),
      finance_o2c_mutation: false,
    },
  };
}

export function summarizePayrollAdjustments(adjustments = []) {
  return adjustments.reduce(
    (totals, adjustment) => {
      const amount = money(adjustment.amount);
      const type = normalizeAdjustmentType(adjustment.adjustment_type ?? adjustment.adjustmentType);
      if (amount >= 0) totals.manual_adjustments_total = money(totals.manual_adjustments_total + amount);
      if (amount < 0) totals.penalties_total = money(totals.penalties_total + Math.abs(amount));
      if (type === PAYROLL_ADJUSTMENT_TYPES.RECOVERY) {
        totals.recoveries_total = money(totals.recoveries_total + Math.abs(amount));
      }
      totals.net_effect = money(totals.net_effect + amount);
      return totals;
    },
    {
      manual_adjustments_total: 0,
      penalties_total: 0,
      recoveries_total: 0,
      net_effect: 0,
    }
  );
}

export function assertPayrollExportAllowed({ payrollRun = {}, actor = {}, format } = {}) {
  assertPayrollPermission(actor.role, PAYROLL_ACTIONS.EXPORT);
  if (!Object.values(PAYROLL_EXPORT_FORMATS).includes(str(format))) {
    throw new Error(`payroll_export_format_invalid_${str(format) || "empty"}`);
  }
  if (!isPayrollImmutableStatus(payrollRun.status)) {
    throw new Error("payroll_export_requires_locked_run");
  }
  return true;
}

export function buildPayrollExportModel({
  payrollRun = {},
  payrollRunLines = [],
  format = PAYROLL_EXPORT_FORMATS.CSV,
  generatedAt,
} = {}) {
  const exportFormat = str(format);
  if (!Object.values(PAYROLL_EXPORT_FORMATS).includes(exportFormat)) {
    throw new Error(`payroll_export_format_invalid_${exportFormat || "empty"}`);
  }
  if (!isPayrollImmutableStatus(payrollRun.status)) {
    throw new Error("payroll_export_requires_locked_run");
  }
  const rows = payrollRunLines.map(normalizeLine);
  const totals = rows.reduce(
    (acc, row) => ({
      salary_amount: money(acc.salary_amount + row.salary_amount),
      fuel_allowance: money(acc.fuel_allowance + row.fuel_allowance),
      mobile_allowance: money(acc.mobile_allowance + row.mobile_allowance),
      commission_amount: money(acc.commission_amount + row.commission_amount),
      gross_pay: money(acc.gross_pay + row.gross_pay),
      deductions_total: money(acc.deductions_total + row.deductions_total),
      net_payable: money(acc.net_payable + row.net_payable),
    }),
    {
      salary_amount: 0,
      fuel_allowance: 0,
      mobile_allowance: 0,
      commission_amount: 0,
      gross_pay: 0,
      deductions_total: 0,
      net_payable: 0,
    }
  );

  const model = {
    format: exportFormat,
    ruleVersion: PAYROLL_DOMAIN_RULE_VERSION,
    generatedAt: nowIso(generatedAt),
    payrollRunId: str(payrollRun.id ?? payrollRun.payroll_run_id ?? payrollRun.payrollRunId),
    periodId: str(payrollRun.period_id ?? payrollRun.periodId),
    periodYm: str(payrollRun.period_ym ?? payrollRun.periodYm),
    columns: [...EXPORT_COLUMNS],
    rows,
    totals,
    financeMutation: false,
  };

  if (exportFormat === PAYROLL_EXPORT_FORMATS.CSV) {
    model.contentType = "text/csv";
    model.body = [
      EXPORT_COLUMNS.join(","),
      ...rows.map((row) =>
        EXPORT_COLUMNS.map((column) => JSON.stringify(row[column] ?? "")).join(",")
      ),
    ].join("\n");
  }

  if (exportFormat === PAYROLL_EXPORT_FORMATS.EXCEL) {
    model.contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    model.workbook = {
      sheets: [
        {
          name: "Payroll Export",
          columns: [...EXPORT_COLUMNS],
          rows,
        },
      ],
    };
  }

  if (exportFormat === PAYROLL_EXPORT_FORMATS.ACCOUNTING_READY) {
    model.contentType = "application/json";
    model.accountingEntries = rows.map((row) => ({
      external_ref: `${model.payrollRunId}:${row.agent_id}`,
      counterparty_type: "agent",
      counterparty_id: row.agent_id,
      counterparty_name: row.agent_name,
      payable_amount: row.net_payable,
      memo: `Payroll ${model.periodYm}`,
      no_gl_posting_created: true,
      no_bank_disbursement_created: true,
    }));
  }

  return model;
}
