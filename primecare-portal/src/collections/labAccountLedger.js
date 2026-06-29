function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deriveLabPaymentStatus({ outstandingAmount = 0, totalPaid = 0, totalDelivered = 0 } = {}) {
  const outstanding = num(outstandingAmount);
  const paid = num(totalPaid);
  const delivered = num(totalDelivered);
  if (outstanding <= 0.009) return paid > 0 || delivered > 0 ? "Paid" : "Current";
  if (paid > 0) return "Partially Paid";
  return "Outstanding";
}

function str(v) {
  return String(v ?? "").trim();
}

function isPaidInvoice(inv = {}) {
  const status = str(inv.displayStatus || inv.status).toLowerCase();
  return status === "paid" || status === "fully_paid";
}

function isOverdueInvoice(inv = {}) {
  const status = str(inv.displayStatus || inv.status).toLowerCase();
  if (status === "overdue") return true;
  const due = str(inv.dueDate ?? inv.due_date).slice(0, 10);
  const open = num(inv.openBalance ?? inv.open_balance);
  return due && due < new Date().toISOString().slice(0, 10) && open > 0.009;
}

/**
 * Live lab account ledger from invoices, payments, allocations, and optional AR/credit rows.
 * Used when ar_credit_control is absent or incomplete on production.
 */
export function buildLabAccountLedger({
  invoices = [],
  paymentHistory = [],
  arRow = null,
  labId = "",
  labName = "",
} = {}) {
  let openBalance = 0;
  let invoicedTotal = 0;
  let maxOverdueDays = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const inv of invoices) {
    openBalance += num(inv.openBalance ?? inv.open_balance);
    invoicedTotal += num(inv.totalAmount ?? inv.total_amount);
    if (isOverdueInvoice(inv)) {
      const due = str(inv.dueDate ?? inv.due_date).slice(0, 10);
      if (due) {
        const days = Math.max(
          0,
          Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(`${due}T12:00:00`)) / 86400000)
        );
        maxOverdueDays = Math.max(maxOverdueDays, days);
      }
    }
  }

  const paymentSum = (paymentHistory || []).reduce(
    (sum, row) => sum + num(row.amountCollected ?? row.amount_collected ?? row.amount),
    0
  );

  const paidFromInvoices = invoices
    .filter(isPaidInvoice)
    .reduce((sum, inv) => sum + num(inv.totalAmount ?? inv.total_amount), 0);

  const arOutstanding = num(arRow?.outstandingAmount ?? arRow?.outstanding ?? arRow?.outstanding_amount);
  const arTotalPaid = num(arRow?.totalPaid ?? arRow?.total_paid);
  const creditLimit = num(
    arRow?.creditLimit ?? arRow?.credit_limit ?? arRow?.creditApproved ?? arRow?.credit_limit_amount
  );

  const outstanding =
    arOutstanding > 0 ? arOutstanding : openBalance > 0 ? openBalance : openBalance;
  const totalPaid = arTotalPaid > 0 ? arTotalPaid : paymentSum > 0 ? paymentSum : paidFromInvoices;
  const creditRemaining = creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;

  const recentPayments = [...(paymentHistory || [])]
    .sort((a, b) => str(b.paymentDate ?? b.payment_date).localeCompare(str(a.paymentDate ?? a.payment_date)))
    .slice(0, 8);

  const recentInvoices = [...invoices]
    .sort((a, b) =>
      str(b.invoiceDate ?? b.invoice_date ?? b.createdAt).localeCompare(
        str(a.invoiceDate ?? a.invoice_date ?? a.createdAt)
      )
    )
    .slice(0, 8);

  const collectionItem = {
    labId: str(labId || arRow?.labId || arRow?.lab_id),
    labName: str(labName || arRow?.labName || arRow?.lab_name),
    outstandingAmount: outstanding,
    totalPaid,
    creditLimit,
    overdueDays: num(arRow?.overdueDays ?? arRow?.days_overdue) || maxOverdueDays,
    riskStatus: str(arRow?.riskStatus || arRow?.credit_status || "Low"),
    paymentStatus: deriveLabPaymentStatus({
      outstandingAmount: outstanding,
      totalPaid,
      totalDelivered: num(arRow?.totalDelivered ?? arRow?.total_delivered ?? invoicedTotal),
    }),
    nextFollowUp: str(arRow?.nextFollowUp ?? arRow?.next_follow_up ?? ""),
    dueDate: str(arRow?.dueDate ?? arRow?.due_date ?? ""),
  };

  return {
    outstanding,
    totalPaid,
    creditLimit,
    creditRemaining,
    overdueDays: collectionItem.overdueDays,
    invoiceCount: invoices.length,
    paymentCount: (paymentHistory || []).length,
    recentPayments,
    recentInvoices,
    collectionItem,
    hasLedgerData:
      invoices.length > 0 ||
      (paymentHistory || []).length > 0 ||
      outstanding > 0 ||
      totalPaid > 0 ||
      Boolean(arRow),
  };
}

/** @deprecated Use buildLabAccountLedger */
export function buildLabAccountFallbackSummary(invoices = [], paymentHistory = [], invoiceTotal = null) {
  const ledger = buildLabAccountLedger({ invoices, paymentHistory });
  const invoiceCount =
    Number(invoiceTotal) > 0 ? Number(invoiceTotal) : ledger.invoiceCount;
  return {
    invoiceCount,
    openBalance: ledger.outstanding,
    totalPaid: ledger.totalPaid,
    invoicedTotal: invoices.reduce((s, inv) => s + num(inv.totalAmount ?? inv.total_amount), 0),
    fullyPaid: invoiceCount > 0 && ledger.outstanding <= 0.009,
    paymentCount: ledger.paymentCount,
  };
}
