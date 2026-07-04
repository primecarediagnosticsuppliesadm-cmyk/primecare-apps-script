import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ux";
import {
  buildPayrollWorkflowActions,
  payrollWorkflowConfirmMessage,
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

function ModalShell({ title, children, onCancel, onConfirm, confirmLabel, confirmDisabled }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="mt-3 space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={confirmDisabled} onClick={onConfirm}>
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
    setPendingAction(null);
    setReason("");
    setPaymentReference("");
    setPaidNotes("");
  };

  const runAction = (actionId, payload = {}) => {
    onAction?.(periodRow, actionId, payload);
    closeModal();
  };

  const handleClick = (action) => {
    if (action.id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW) {
      runAction(action.id);
      return;
    }
    if (action.requiresReason || action.requiresPaidForm) {
      setPendingAction(action);
      return;
    }
    if (action.requiresConfirm) {
      const ok = window.confirm(payrollWorkflowConfirmMessage(action.id, periodRow.periodYm));
      if (!ok) return;
    }
    runAction(action.id);
  };

  const confirmReject = () => {
    if (!reason.trim()) return;
    runAction(PAYROLL_UI_ACTION_IDS.REJECT, { reason: reason.trim() });
  };

  const confirmPaid = () => {
    if (!paidDate.trim() || !paymentReference.trim()) return;
    runAction(PAYROLL_UI_ACTION_IDS.MARK_PAID, {
      paidDate,
      paymentReference: paymentReference.trim(),
      notes: paidNotes.trim(),
      reason: `paid_evidence:${paymentReference.trim()}`,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
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
            <p className="mt-1 text-[10px] text-slate-500">View and recommend only. Workflow actions require Executive or HR submit access.</p>
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
                disabled={
                  busy ||
                  (action.id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW &&
                    generatingPeriodId === periodRow.periodId)
                }
                onClick={() => handleClick(action)}
              >
                {action.id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW &&
                generatingPeriodId === periodRow.periodId
                  ? "Generating…"
                  : action.label}
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
          confirmLabel="Reject"
          confirmDisabled={!reason.trim() || busy}
          onCancel={closeModal}
          onConfirm={confirmReject}
        >
          <p className="text-xs text-slate-600">Reject returns the run to draft. A reason is required.</p>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reason</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this preview rejected?" />
          </label>
        </ModalShell>
      ) : null}

      {pendingAction?.id === PAYROLL_UI_ACTION_IDS.MARK_PAID ? (
        <ModalShell
          title="Mark Paid Evidence"
          confirmLabel="Record Paid Evidence"
          confirmDisabled={!paidDate.trim() || !paymentReference.trim() || busy}
          onCancel={closeModal}
          onConfirm={confirmPaid}
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
    </div>
  );
}
