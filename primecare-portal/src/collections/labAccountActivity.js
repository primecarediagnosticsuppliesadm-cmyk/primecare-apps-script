function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

function paymentMethodLabel(mode) {
  const m = str(mode);
  if (!m) return "";
  return m.charAt(0).toUpperCase() + m.slice(1);
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
    const orderId = str(entry.orderId ?? entry.order_id);
    const paymentDate = entry.paymentDate ?? entry.updatedAt ?? "";
    const mode = paymentMethodLabel(entry.paymentMode ?? entry.mode);
    const outstandingAfter = num(entry.outstandingAfter ?? entry.outstanding_after);
    const reducedTo = Number.isFinite(outstandingAfter) ? outstandingAfter : outstandingNow;
    const appliedRef = [
      invoiceId ? `INV ${invoiceId}` : "",
      orderId ? `Order ${orderId}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: entry.paymentId || `pay-${paymentDate}-${amount}-${invoiceId}`,
      title: amount > 0 ? `Payment received — ${formatMoney(amount)}` : "Account update",
      subline: appliedRef
        ? `Applied to ${appliedRef}${mode ? ` · Method: ${mode}` : ""}`
        : mode
          ? `Method: ${mode}`
          : "Account balance updated",
      trailing:
        amount > 0
          ? `Outstanding balance ${formatMoney(reducedTo)}`
          : `Balance ${formatMoney(reducedTo)}`,
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
    const rawStatus = str(inv.rawStatus ?? inv.status).toLowerCase();
    const isSent = Boolean(sentAt) || rawStatus === "sent";

    if (orderId && (invoiceDate || sentAt)) {
      lifecycle.push({
        id: `fulfill-${orderId}-${invoiceLabel}`,
        title: `Order fulfilled — ${orderId}`,
        subline: invoiceLabel ? `Invoice ${invoiceLabel} generated` : "Invoice generated",
        trailing: total > 0 ? `Total ${formatMoney(total)}` : "",
        date: invoiceDate || sentAt,
        kind: "fulfillment",
        sortKey: invoiceDate || sentAt,
      });
    }

    if (invoiceLabel && isSent) {
      lifecycle.push({
        id: `invoice-${inv.invoiceDbId || invoiceLabel}`,
        title: `Invoice sent — ${invoiceLabel}`,
        subline:
          open > 0.009
            ? `Awaiting payment${dueDate ? ` · due ${formatShortDate(dueDate)}` : ""}`
            : "Paid in full",
        trailing: open > 0.009 ? `Open ${formatMoney(open)}` : formatMoney(total),
        date: sentAt || invoiceDate,
        kind: "invoice",
        sortKey: sentAt || invoiceDate,
      });
    } else if (invoiceLabel && open > 0.009) {
      lifecycle.push({
        id: `invoice-${inv.invoiceDbId || invoiceLabel}`,
        title: `Invoice issued — ${invoiceLabel}`,
        subline: orderId ? `Order ${orderId}` : "Awaiting payment",
        trailing: `Open ${formatMoney(open)}`,
        date: invoiceDate || sentAt,
        kind: "invoice",
        sortKey: invoiceDate || sentAt,
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

/** KPI / Account Health credit label adapts when no limit is configured. */
export function formatCreditKpiDisplay(creditLimit, outstanding, formatMoney) {
  const limit = num(creditLimit);
  if (limit <= 0) {
    return { label: "Credit Policy", value: "Not configured" };
  }
  return {
    label: "Available Credit",
    value: formatMoney(Math.max(0, limit - num(outstanding))),
  };
}
