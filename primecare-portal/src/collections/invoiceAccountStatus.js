function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Per-invoice display status for lab account / collections UI.
 */
export function deriveInvoiceAccountStatus({
  status = "",
  openBalance = 0,
  paidAmount = 0,
  allocatedAmount = 0,
  dueDate = "",
  sentAt = "",
  creditHold = "",
} = {}) {
  const open = num(openBalance);
  const paid = num(paidAmount);
  const allocated = num(allocatedAmount);
  const raw = str(status).toLowerCase();
  const due = str(dueDate).slice(0, 10);
  const sent = str(sentAt);
  const today = todayYmd();
  const hold = str(creditHold).toUpperCase();

  if (hold === "HOLD" || hold === "YES") return "Credit Hold";
  if (raw === "cancelled") return "Cancelled";
  if (raw === "failed") return "Failed";
  if (open <= 0.009) return "Paid";
  if (due && due < today && open > 0.009) return "Overdue";
  if ((paid > 0.009 || allocated > 0.009) && open > 0.009) return "Partially Paid";
  if (raw === "draft" && !sent) return "Draft";
  if (raw === "sent" || sent) return "Sent";
  if (raw === "draft") return "Draft";
  return "Open";
}

/**
 * Account Health panel label + tone.
 */
export function deriveAccountHealthStatus({
  outstandingAmount = 0,
  totalPaid = 0,
  totalAllocated = 0,
  overdueDays = 0,
  riskStatus = "",
  creditHold = "",
} = {}) {
  const outstanding = num(outstandingAmount);
  const paid = num(totalPaid);
  const allocated = num(totalAllocated);
  const risk = str(riskStatus).toLowerCase();
  const hold = str(creditHold).toUpperCase();

  if (hold === "HOLD" || hold === "YES") {
    return { label: "Credit Hold", tone: "text-red-900 bg-red-100 border-red-300" };
  }
  if (outstanding <= 0.009) {
    return { label: "Good Standing", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }
  if (num(overdueDays) > 0) {
    return { label: "Overdue", tone: "text-red-700 bg-red-50 border-red-200" };
  }
  if (paid > 0.009 || allocated > 0.009) {
    return { label: "Partially Paid", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  }
  if (risk.includes("high")) {
    return { label: "Medium Risk", tone: "text-amber-700 bg-amber-50 border-amber-200" };
  }
  return { label: "Outstanding", tone: "text-sky-800 bg-sky-50 border-sky-200" };
}

/** Collection row payment status (lab account ledger + HQ collections). */
export function deriveLabPaymentStatus({
  outstandingAmount = 0,
  totalPaid = 0,
  totalAllocated = 0,
  overdueDays = 0,
} = {}) {
  const outstanding = num(outstandingAmount);
  const paid = num(totalPaid);
  const allocated = num(totalAllocated);
  if (outstanding <= 0.009) return paid > 0.009 || allocated > 0.009 ? "Paid" : "Current";
  if (num(overdueDays) > 0) return "Overdue";
  if (paid > 0.009 || allocated > 0.009) return "Partially Paid";
  return "Outstanding";
}

export function invoiceStatusTone(label) {
  const key = str(label).toLowerCase();
  if (key === "credit hold") return "bg-red-100 text-red-900 border border-red-300";
  if (key === "paid" || key === "good standing") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (key === "overdue") return "bg-red-50 text-red-700 border border-red-200";
  if (key === "partially paid") return "bg-amber-50 text-amber-800 border border-amber-200";
  if (key === "draft") return "bg-slate-100 text-slate-600 border border-slate-200";
  if (key === "sent" || key === "open" || key === "outstanding" || key === "unpaid") {
    return "bg-sky-50 text-sky-800 border border-sky-200";
  }
  return "bg-slate-50 text-slate-700 border border-slate-200";
}

/** Invoice Center document table grid */
export const LAB_INVOICE_CENTER_GRID =
  "grid grid-cols-[minmax(0,1.1fr)_minmax(4.5rem,0.55fr)_minmax(0,1fr)_minmax(3.5rem,0.65fr)_4rem_4rem_4rem_3.5rem_auto] items-center gap-x-2";

/** Payments & Account open-invoice summary (compact) */
export const LAB_OPEN_INVOICE_SUMMARY_GRID =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(4rem,0.5fr)_minmax(3.5rem,0.55fr)_auto] items-center gap-x-3";

export const LAB_INVOICE_TABLE_GRID =
  "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_4.25rem_4.25rem_4.25rem_minmax(3.75rem,0.75fr)_auto] items-center gap-x-2";
