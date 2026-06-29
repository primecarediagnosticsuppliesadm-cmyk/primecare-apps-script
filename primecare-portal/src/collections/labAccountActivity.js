function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Payment + invoice lifecycle timeline for lab account Payment Activity tab.
 */
export function buildLabAccountActivityTimeline({
  item = {},
  history = [],
  invoices = [],
  formatMoney = (v) => String(v),
  formatShortDate = (v) => str(v).slice(0, 10) || "—",
} = {}) {
  const outstandingNow = num(item?.outstandingAmount);
  const paymentEntries = (history || []).map((entry) => {
    const amount = num(entry.amountCollected ?? entry.amount);
    const invoiceId = str(entry.invoiceId ?? entry.invoice_id);
    const paymentDate = entry.paymentDate ?? entry.updatedAt ?? "";
    const mode = str(entry.paymentMode ?? entry.mode);
    const outstandingAfter = num(entry.outstandingAfter ?? entry.outstanding_after);
    const reducedTo = Number.isFinite(outstandingAfter) ? outstandingAfter : outstandingNow;
    return {
      id: entry.paymentId || `pay-${paymentDate}-${amount}-${invoiceId}`,
      title: amount > 0 ? `${formatMoney(amount)} payment received` : "Account update",
      subline: `Applied to ${invoiceId || "latest invoice"}${mode ? ` · ${mode}` : ""}`,
      trailing: `Outstanding ${formatMoney(reducedTo)}`,
      date: paymentDate,
      kind: amount > 0 ? "payment" : "update",
      sortKey: paymentDate,
    };
  });

  if (paymentEntries.length) {
    return paymentEntries.sort((a, b) => str(b.sortKey).localeCompare(str(a.sortKey)));
  }

  const lifecycle = [];
  for (const inv of invoices || []) {
    const invoiceLabel = str(inv.invoiceId ?? inv.invoiceNumber);
    const orderId = str(inv.orderId);
    const total = num(inv.totalAmount ?? inv.amount);
    const open = num(inv.openBalance ?? Math.max(0, total - num(inv.allocatedAmount)));
    const invoiceDate = str(inv.invoiceDate);
    const sentAt = str(inv.sentAt);
    const dueDate = str(inv.dueDate);
    const status = str(inv.status).toLowerCase();

    if (invoiceLabel) {
      lifecycle.push({
        id: `invoice-${inv.invoiceDbId || invoiceLabel}`,
        title: sentAt || status === "sent" ? `Invoice ${invoiceLabel} sent` : `Invoice ${invoiceLabel} created`,
        subline: `Order ${orderId || "—"} · ${formatMoney(total)}`,
        trailing: open > 0.009 ? `Open ${formatMoney(open)}` : "Paid in full",
        date: sentAt || invoiceDate,
        kind: "invoice",
        sortKey: sentAt || invoiceDate,
      });
    }

    if (orderId && open > 0.009) {
      lifecycle.push({
        id: `fulfill-${orderId}-${invoiceLabel}`,
        title: "Order fulfilled — invoice issued",
        subline: `${invoiceLabel} · ${formatMoney(total)}`,
        trailing: `Due ${formatShortDate(dueDate)}`,
        date: invoiceDate || sentAt,
        kind: "fulfillment",
        sortKey: invoiceDate || sentAt,
      });
    }

    if (open > 0.009) {
      lifecycle.push({
        id: `await-${inv.invoiceDbId || invoiceLabel}`,
        title: "Awaiting payment",
        subline: `${invoiceLabel}${dueDate ? ` · due ${formatShortDate(dueDate)}` : ""}`,
        trailing: formatMoney(open),
        date: dueDate || invoiceDate || sentAt,
        kind: "pending",
        sortKey: dueDate || invoiceDate || sentAt,
      });
    }
  }

  if (lifecycle.length) {
    const seen = new Set();
    return lifecycle
      .filter((row) => {
        const key = `${row.id}|${row.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => str(b.sortKey).localeCompare(str(a.sortKey)));
  }

  if (outstandingNow > 0.009) {
    return [
      {
        id: "account-open",
        title: "Outstanding balance on account",
        subline: "No payment recorded yet",
        trailing: formatMoney(outstandingNow),
        date: str(item?.dueDate ?? item?.nextFollowUp),
        kind: "pending",
        sortKey: str(item?.dueDate ?? item?.nextFollowUp),
      },
    ];
  }

  return [];
}

export function formatCreditRemainingLabel(creditLimit, outstanding, formatMoney) {
  const limit = num(creditLimit);
  if (limit <= 0) return "Not configured";
  return formatMoney(Math.max(0, limit - num(outstanding)));
}
