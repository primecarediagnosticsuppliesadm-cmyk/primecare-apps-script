function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isPaidInvoice(inv = {}) {
  const status = String(inv.displayStatus || inv.status || "").toLowerCase();
  return status === "paid" || status === "fully_paid";
}

/**
 * Summarize lab invoices + payment history when ar_credit_control row is absent.
 */
export function buildLabAccountFallbackSummary(
  invoices = [],
  paymentHistory = [],
  invoiceTotal = null
) {
  const invoiceCount =
    Number(invoiceTotal) > 0 ? Number(invoiceTotal) : invoices.length;

  let openBalance = 0;
  let invoicedTotal = 0;
  for (const inv of invoices) {
    openBalance += num(inv.openBalance ?? inv.open_balance);
    invoicedTotal += num(inv.totalAmount ?? inv.total_amount);
  }

  const paymentSum = (paymentHistory || []).reduce(
    (sum, row) => sum + num(row.amountCollected ?? row.amount_collected ?? row.amount),
    0
  );

  const paidFromInvoices = invoices
    .filter(isPaidInvoice)
    .reduce((sum, inv) => sum + num(inv.totalAmount ?? inv.total_amount), 0);

  const totalPaid = paymentSum > 0 ? paymentSum : paidFromInvoices;
  const fullyPaid = invoiceCount > 0 && openBalance <= 0.009;

  return {
    invoiceCount,
    openBalance,
    totalPaid,
    invoicedTotal,
    fullyPaid,
    paymentCount: (paymentHistory || []).length,
  };
}
