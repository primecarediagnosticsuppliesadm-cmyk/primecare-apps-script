import {
  PAYROLL_ACTIONS,
  PAYROLL_STATUSES,
  canPerformPayrollAction,
} from "./payrollDomainWorkflow.js";

export const PAYROLL_UI_ACTION_IDS = Object.freeze({
  GENERATE_PREVIEW: "generate_preview",
  SUBMIT: "submit",
  APPROVE: "approve",
  REJECT: "reject",
  LOCK: "lock",
  EXPORT: "export",
  MARK_PAID: "mark_paid",
});

const IRREVERSIBLE = new Set([
  PAYROLL_UI_ACTION_IDS.APPROVE,
  PAYROLL_UI_ACTION_IDS.LOCK,
  PAYROLL_UI_ACTION_IDS.EXPORT,
  PAYROLL_UI_ACTION_IDS.MARK_PAID,
]);

function roleKey(role) {
  return String(role || "").trim().toLowerCase();
}

function statusKey(status) {
  return String(status || PAYROLL_STATUSES.DRAFT).trim().toLowerCase();
}

export function payrollWorkflowPermissions(role) {
  const key = roleKey(role);
  return {
    role: key,
    canGeneratePreview: canPerformPayrollAction(key, PAYROLL_ACTIONS.PREVIEW),
    canSubmit: canPerformPayrollAction(key, PAYROLL_ACTIONS.SUBMIT),
    canApprove: canPerformPayrollAction(key, PAYROLL_ACTIONS.APPROVE),
    canReject: canPerformPayrollAction(key, PAYROLL_ACTIONS.REJECT),
    canLock: canPerformPayrollAction(key, PAYROLL_ACTIONS.LOCK),
    canExport: canPerformPayrollAction(key, PAYROLL_ACTIONS.EXPORT),
    canMarkPaid: canPerformPayrollAction(key, PAYROLL_ACTIONS.PAY),
    adminViewOnly: key === "admin",
  };
}

export function buildPayrollWorkflowActions({
  status,
  hasRun = false,
  hasRunLines = false,
  role,
} = {}) {
  const perms = payrollWorkflowPermissions(role);
  const currentStatus = statusKey(status);
  const actions = [];

  function push(id, label, extra = {}) {
    actions.push({
      id,
      label,
      requiresConfirm: IRREVERSIBLE.has(id) || extra.requiresConfirm === true,
      requiresReason: extra.requiresReason === true,
      requiresPaidForm: extra.requiresPaidForm === true,
      ...extra,
    });
  }

  if (currentStatus === PAYROLL_STATUSES.DRAFT) {
    if (perms.canGeneratePreview) {
      push(PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW, "Generate Preview");
    }
    if (hasRun && hasRunLines && perms.canSubmit) {
      push(PAYROLL_UI_ACTION_IDS.SUBMIT, "Submit Preview", { requiresConfirm: true });
    }
  } else if (currentStatus === PAYROLL_STATUSES.PREVIEWED && perms.canSubmit) {
    push(PAYROLL_UI_ACTION_IDS.SUBMIT, "Submit Preview", { requiresConfirm: true });
  } else if (currentStatus === PAYROLL_STATUSES.SUBMITTED) {
    if (perms.canApprove) push(PAYROLL_UI_ACTION_IDS.APPROVE, "Approve", { requiresConfirm: true });
    if (perms.canReject) push(PAYROLL_UI_ACTION_IDS.REJECT, "Reject", { requiresReason: true });
  } else if (currentStatus === PAYROLL_STATUSES.APPROVED && perms.canLock) {
    push(PAYROLL_UI_ACTION_IDS.LOCK, "Lock Payroll", { requiresConfirm: true });
  } else if (currentStatus === PAYROLL_STATUSES.LOCKED && perms.canExport) {
    push(PAYROLL_UI_ACTION_IDS.EXPORT, "Generate Export", { requiresConfirm: true });
  } else if (currentStatus === PAYROLL_STATUSES.EXPORTED && perms.canMarkPaid) {
    push(PAYROLL_UI_ACTION_IDS.MARK_PAID, "Mark Paid Evidence", { requiresPaidForm: true });
  }

  return actions;
}

export function payrollWorkflowConfirmMessage(actionId, periodYm) {
  const period = periodYm || "this period";
  switch (actionId) {
    case PAYROLL_UI_ACTION_IDS.SUBMIT:
      return `Submit payroll preview for ${period}? This sends the run for Executive review.`;
    case PAYROLL_UI_ACTION_IDS.APPROVE:
      return `Approve payroll for ${period}? Approved runs can be locked but not edited.`;
    case PAYROLL_UI_ACTION_IDS.LOCK:
      return `Lock payroll for ${period}? Locked values become immutable.`;
    case PAYROLL_UI_ACTION_IDS.EXPORT:
      return `Generate export metadata for ${period}? No bank payout or accounting entry will be created.`;
    case PAYROLL_UI_ACTION_IDS.MARK_PAID:
      return `Record paid evidence for ${period}? No payment row or bank disbursement will be created.`;
    default:
      return `Continue with this payroll workflow action for ${period}?`;
  }
}
