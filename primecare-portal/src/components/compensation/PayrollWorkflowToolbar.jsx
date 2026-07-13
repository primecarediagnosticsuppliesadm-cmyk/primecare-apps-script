import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ux";
import ActionErrorSummary from "@/components/ux/ActionErrorSummary.jsx";
import {
  buildPayrollWorkflowActions,
  payrollWorkflowActionLoadingLabel,
  payrollWorkflowConfirmMessage,
  payrollWorkflowConfirmTitle,
  payrollWorkflowPermissions,
  PAYROLL_UI_ACTION_IDS,
} from "@/payroll/payrollWorkflowUi.js";

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
};

const CONFIRM_MODAL_ACTIONS = new Set([
  PAYROLL_UI_ACTION_IDS.SUBMIT,
  PAYROLL_UI_ACTION_IDS.APPROVE,
  PAYROLL_UI_ACTION_IDS.LOCK,
  PAYROLL_UI_ACTION_IDS.EXPORT,
]);

function ModalShell({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  busy = false,
  mutationError = null,
  onDismissError,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close payroll workflow dialog"
        onClick={() => {
          if (!busy) onCancel?.();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="payroll-workflow-modal-title"
        className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h3 id="payroll-workflow-modal-title" className="text-sm font-semibold text-slate-900">
          {title}
        </h3>
        <div className="mt-3 space-y-3">
          {children}
          {mutationError ? (
            <ActionErrorSummary
              title={mutationError.title}
              message={mutationError.message}
              fieldErrors={mutationError.fieldErrors}
              actions={mutationError.suggestedActions}
              technicalReference={mutationError.rawErrorForLogging}
              onDismiss={onDismissError}
            />
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={confirmDisabled || busy}
            onClick={onConfirm}
            aria-busy={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PayrollWorkflowToolbar({
  periodRow,
  actorRole = "executive",
  busy = false,
  generatingPeriodId = "",
  onAction,
}) {
  const [pendingAction, setPendingAction] = useState(null);
  const [workflowError, setWorkflowError] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [executingActionId, setExecutingActionId] = useState("");
  const [reason, setReason] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState("");
  const [paidNotes, setPaidNotes] = useState("");

  const permissions = useMemo(() => payrollWorkflowPermissions(actorRole), [actorRole]);
  const actions = useMemo(
    () =>
      buildPayrollWorkflowActions({
        status: periodRow?.status,
        hasRun: Boolean(periodRow?.runId),
        hasRunLines: Number(periodRow?.employeeCount || 0) > 0,
        role: actorRole,
      }),
    [actorRole, periodRow]
  );

  if (!periodRow) return null;

  const closeModal = () => {
    if (busy || executingActionId) return;
    setPendingAction(null);
    setModalError(null);
    setReason("");
    setPaymentReference("");
    setPaidNotes("");
  };

  const executeAction = async (actionId, payload = {}) => {
    setWorkflowError(null);
    setModalError(null);
    setExecutingActionId(actionId);
    try {
      const result = await onAction?.(periodRow, actionId, payload);
      if (result?.success) {
        closeModal();
        return true;
      }
      const mappedError = result?.error || null;
      if (mappedError) {
        if (pendingAction) setModalError(mappedError);
        else setWorkflowError(mappedError);
      }
      return false;
    } finally {
      setExecutingActionId("");
    }
  };

  const handleClick = async (action) => {
    setWorkflowError(null);
    if (action.id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW) {
      await executeAction(action.id);
      return;
    }
    if (action.requiresReason || action.requiresPaidForm || action.requiresConfirm || CONFIRM_MODAL_ACTIONS.has(action.id)) {
      setModalError(null);
      setPendingAction(action);
      return;
    }
    await executeAction(action.id);
  };

  const confirmReject = async () => {
    if (!reason.trim()) return;
    setExecutingActionId(PAYROLL_UI_ACTION_IDS.REJECT);
    try {
      const result = await onAction?.(periodRow, PAYROLL_UI_ACTION_IDS.REJECT, { reason: reason.trim() });
      if (result?.success) {
        closeModal();
        return;
      }
      if (result?.error) setModalError(result.error);
    } finally {
      setExecutingActionId("");
    }
  };

  const confirmPaid = async () => {
    if (!paidDate.trim() || !paymentReference.trim()) return;
    setExecutingActionId(PAYROLL_UI_ACTION_IDS.MARK_PAID);
    try {
      const result = await onAction?.(periodRow, PAYROLL_UI_ACTION_IDS.MARK_PAID, {
        paidDate,
        paymentReference: paymentReference.trim(),
        notes: paidNotes.trim(),
        reason: `paid_evidence:${paymentReference.trim()}`,
      });
      if (result?.success) {
        closeModal();
        return;
      }
      if (result?.error) setModalError(result.error);
    } finally {
      setExecutingActionId("");
    }
  };

  const confirmDestructive = async () => {
    if (!pendingAction?.id) return;
    await executeAction(pendingAction.id);
  };

  const actionBusy = (actionId) =>
    busy || executingActionId === actionId || (actionId === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW && generatingPeriodId === periodRow.periodId);

  const buttonLabel = (action) => {
    if (actionBusy(action.id)) {
      return payrollWorkflowActionLoadingLabel(action.id);
    }
    return action.label;
  };

  const modalBusy = Boolean(executingActionId) || busy;
  const modalConfirmLabel = pendingAction
    ? modalBusy
      ? payrollWorkflowActionLoadingLabel(pendingAction.id)
      : pendingAction.id === PAYROLL_UI_ACTION_IDS.REJECT
        ? "Reject"
        : pendingAction.id === PAYROLL_UI_ACTION_IDS.MARK_PAID
          ? "Record Paid Evidence"
          : payrollWorkflowConfirmTitle(pendingAction.id).replace(/^Confirm /, "")
    : "Confirm";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      {workflowError ? (
        <ActionErrorSummary
          className="mb-3"
          title={workflowError.title}
          message={workflowError.message}
          fieldErrors={workflowError.fieldErrors}
          actions={workflowError.suggestedActions}
          technicalReference={workflowError.rawErrorForLogging}
          onDismiss={() => setWorkflowError(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Payroll Workflow</p>
          <p className="text-sm text-slate-900">
            {periodRow.periodYm} · run v{periodRow.runVersion ?? "—"}
          </p>
          <div className="mt-1">
            <StatusBadge variant={STATUS_VARIANT[periodRow.status] || "neutral"} label={periodRow.status} />
          </div>
          {permissions.adminViewOnly ? (
            <p className="mt-1 text-[10px] text-slate-500">
              View and recommend only. Workflow actions require Executive or HR submit access.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.length ? (
            actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={action.id === PAYROLL_UI_ACTION_IDS.REJECT ? "outline" : "default"}
                disabled={actionBusy(action.id) || Boolean(executingActionId)}
                onClick={() => void handleClick(action)}
                aria-busy={actionBusy(action.id)}
              >
                {buttonLabel(action)}
              </Button>
            ))
          ) : (
            <p className="text-xs text-slate-500">
              {periodRow.status === "paid" ? "Paid evidence recorded. View only." : "No workflow actions available."}
            </p>
          )}
        </div>
      </div>

      {pendingAction?.id === PAYROLL_UI_ACTION_IDS.REJECT ? (
        <ModalShell
          title="Reject Payroll Preview"
          confirmLabel={modalBusy ? payrollWorkflowActionLoadingLabel(PAYROLL_UI_ACTION_IDS.REJECT) : "Reject"}
          confirmDisabled={!reason.trim()}
          busy={modalBusy}
          mutationError={modalError}
          onDismissError={() => setModalError(null)}
          onCancel={closeModal}
          onConfirm={() => void confirmReject()}
        >
          <p className="text-xs text-slate-600">Reject returns the run to draft. A reason is required.</p>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reason</span>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this preview rejected?"
            />
          </label>
        </ModalShell>
      ) : null}

      {pendingAction?.id === PAYROLL_UI_ACTION_IDS.MARK_PAID ? (
        <ModalShell
          title="Mark Paid Evidence"
          confirmLabel={modalBusy ? payrollWorkflowActionLoadingLabel(PAYROLL_UI_ACTION_IDS.MARK_PAID) : "Record Paid Evidence"}
          confirmDisabled={!paidDate.trim() || !paymentReference.trim()}
          busy={modalBusy}
          mutationError={modalError}
          onDismissError={() => setModalError(null)}
          onCancel={closeModal}
          onConfirm={() => void confirmPaid()}
        >
          <p className="text-xs text-slate-600">
            Records payroll-domain paid evidence only. No bank payout, GL posting, or payment row is created.
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Paid Date</span>
            <Input type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reference</span>
            <Input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="Payroll batch reference"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notes</span>
            <Input value={paidNotes} onChange={(event) => setPaidNotes(event.target.value)} placeholder="Optional notes" />
          </label>
        </ModalShell>
      ) : null}

      {pendingAction && CONFIRM_MODAL_ACTIONS.has(pendingAction.id) ? (
        <ModalShell
          title={payrollWorkflowConfirmTitle(pendingAction.id)}
          confirmLabel={modalConfirmLabel}
          confirmDisabled={false}
          busy={modalBusy}
          mutationError={modalError}
          onDismissError={() => setModalError(null)}
          onCancel={closeModal}
          onConfirm={() => void confirmDestructive()}
        >
          <p className="text-xs text-slate-600">
            {payrollWorkflowConfirmMessage(pendingAction.id, periodRow.periodYm)}
          </p>
        </ModalShell>
      ) : null}
    </div>
  );
}
