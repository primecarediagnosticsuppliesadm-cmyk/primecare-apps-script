function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

function isRecord(v) {
  return v != null && typeof v === "object";
}

function paymentMethodLabel(mode) {
  const m = str(mode);
  if (!m) return "";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function invoiceLabel(inv) {
  if (!isRecord(inv)) return "";
  return str(inv.invoiceId ?? inv.invoiceNumber);
}

/** Drop null timeline rows and rows missing a title. */
export function sanitizeTimelineEvents(events = []) {
  return (events || []).filter((row) => isRecord(row) && str(row.title));
}

/** Drop null/invalid invoice rows before timeline or summary use. */
export function filterValidInvoices(invoices = []) {
  return (invoices || []).filter(isRecord);
}

/** Drop null/invalid payment history rows. */
export function filterValidPaymentHistory(history = []) {
  return (history || []).filter(isRecord);
}

function buildInvoiceLifecycleEvents({
  invoices = [],
  formatMoney = (v) => String(v),
} = {}) {
  const events = [];
  const seen = new Set();

  for (const inv of filterValidInvoices(invoices)) {
    const label = invoiceLabel(inv);
    const orderId = str(inv.orderId);
    const total = num(inv.totalAmount ?? inv.amount);
    const open = num(inv.openBalance ?? Math.max(0, total - num(inv.allocatedAmount)));
    const invoiceDate = str(inv.invoiceDate);
    const sentAt = str(inv.sentAt);
    const paidAt = str(inv.paidAt);
    const invKey = str(inv.invoiceDbId ?? inv.id ?? label);

    if (label && invoiceDate) {
      const id = `created-${invKey}`;
      if (!seen.has(id)) {
        seen.add(id);
        events.push({
          id,
          title: "Invoice Created",
          lines: [
            label,
            orderId ? `Order ${orderId}` : null,
            total > 0 ? `Total ${formatMoney(total)}` : null,
          ].filter(Boolean),
          date: invoiceDate,
          kind: "invoice-created",
          sortKey: invoiceDate,
        });
      }
    }

    if (label && sentAt) {
      const id = `sent-${invKey}`;
      if (!seen.has(id)) {
        seen.add(id);
        events.push({
          id,
          title: "Invoice Sent",
          lines: [label, orderId ? `Order ${orderId}` : null].filter(Boolean),
          date: sentAt,
          kind: "invoice-sent",
          sortKey: sentAt,
        });
      }
    }

    if (label && open <= 0.009 && total > 0) {
      const id = `fully-paid-${invKey}`;
      if (!seen.has(id)) {
        seen.add(id);
        events.push({
          id,
          title: "Invoice Fully Paid",
          lines: [label, orderId ? `Order ${orderId}` : null, formatMoney(total)].filter(Boolean),
          date: paidAt || sentAt || invoiceDate,
          kind: "invoice-paid",
          sortKey: paidAt || sentAt || invoiceDate,
        });
      }
    }
  }

  return events;
}

function paymentAppliedLine(invoiceNum, orderId) {
  if (invoiceNum) return `Applied to Invoice ${invoiceNum}`;
  if (orderId) return `Applied to order ${orderId}`;
  return null;
}

function buildPaymentActivityEvents({
  history = [],
  invoices = [],
  item = {},
  formatMoney = (v) => String(v),
} = {}) {
  const outstandingNow = num(item?.outstandingAmount);
  const invoiceByOrder = new Map();
  for (const inv of filterValidInvoices(invoices)) {
    const oid = str(inv.orderId);
    if (oid) invoiceByOrder.set(oid, inv);
  }

  const events = [];
  for (const entry of filterValidPaymentHistory(history)) {
    const amount = num(entry.amountCollected ?? entry.amount);
    if (amount <= 0) continue;

    const orderId = str(entry.orderId ?? entry.order_id);
    const linkedInvoice = orderId ? invoiceByOrder.get(orderId) ?? null : null;
    const invoiceNum =
      str(entry.invoiceId ?? entry.invoice_id) ||
      (linkedInvoice ? invoiceLabel(linkedInvoice) : "");
    const paymentDate = entry.paymentDate ?? entry.sortAt ?? entry.updatedAt ?? "";
    const mode = paymentMethodLabel(entry.paymentMode ?? entry.mode);
    const paymentId = str(entry.paymentId ?? entry.payment_id);
    const outstandingAfter = num(entry.outstandingAfter ?? entry.outstanding_after);
    const reducedTo = Number.isFinite(outstandingAfter) ? outstandingAfter : outstandingNow;
    const appliedLine = paymentAppliedLine(invoiceNum, orderId);

    events.push({
      id: paymentId ? `pay-${paymentId}` : `pay-${paymentDate}-${amount}-${orderId}`,
      title: "Payment received",
      amount: formatMoney(amount),
      lines: [appliedLine, mode ? `Method ${mode}` : null].filter(Boolean),
      trailingLabel: "Outstanding after payment",
      trailingAmount: formatMoney(reducedTo),
      date: paymentDate,
      kind: "payment",
      sortKey: paymentDate,
    });

    if (invoiceNum) {
      events.push({
        id: paymentId ? `alloc-${paymentId}` : `alloc-${paymentDate}-${amount}`,
        title: "Payment Allocated",
        lines: [invoiceNum, formatMoney(amount)],
        date: paymentDate,
        kind: "allocation",
        sortKey: paymentDate,
      });
    }
  }

  return events;
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
  void formatShortDate;

  try {
    const lifecycle = buildInvoiceLifecycleEvents({ invoices, formatMoney });
    const payments = buildPaymentActivityEvents({ history, invoices, item, formatMoney });
    const merged = [...lifecycle, ...payments];

    if (merged.length) {
      const seen = new Set();
      return sanitizeTimelineEvents(
        merged
          .filter((row) => {
            const key = `${row.id}|${row.title}|${row.sortKey}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return Boolean(str(row.sortKey) || str(row.date));
          })
          .sort((a, b) => str(b.sortKey).localeCompare(str(a.sortKey)))
      );
    }

    const outstandingNow = num(item?.outstandingAmount);
    if (outstandingNow > 0.009) {
      return sanitizeTimelineEvents([
        {
          id: "account-open",
          title: "Outstanding balance on account",
          lines: ["No payment recorded yet"],
          trailingAmount: formatMoney(outstandingNow),
          date: str(item?.dueDate ?? item?.nextFollowUp),
          kind: "pending",
          sortKey: str(item?.dueDate ?? item?.nextFollowUp),
        },
      ]);
    }
  } catch (err) {
    console.warn("[buildLabAccountActivityTimeline]", err?.message || err);
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
