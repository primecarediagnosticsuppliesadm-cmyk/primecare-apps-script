function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function eventTimestamp(dateRaw) {
  const s = str(dateRaw).slice(0, 19).replace(" ", "T");
  const t = new Date(s.includes("T") ? s : `${s.slice(0, 10)}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatInr(amount) {
  return `₹${num(amount).toLocaleString("en-IN")}`;
}

/** Parse `[yyyy-mm-dd HH:mm:ss] note` lines from ar_credit_control.collections_notes. */
export function parseCollectionsNotesTimeline(collectionsNotes) {
  const events = [];
  for (const line of String(collectionsNotes || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!match) continue;
    events.push({
      id: `note-${match[1]}-${events.length}`,
      date: match[1].slice(0, 10),
      title: "Follow-up note",
      detail: match[2],
      kind: "followup",
    });
  }
  return events;
}

function buildPaymentActivityEvents(history = []) {
  return (history || []).map((entry, index) => {
    const amount = num(entry.amountCollected ?? entry.amount ?? 0);
    const date = str(entry.paymentDate ?? entry.payment_date ?? entry.sortAt ?? "").slice(0, 10);
    const paymentId = str(entry.paymentId ?? entry.payment_id ?? "") || `PAY-${index + 1}`;
    const mode = str(entry.paymentMode ?? entry.mode ?? "");
    const orderId = str(entry.orderId ?? entry.order_id ?? "");
    const note = str(entry.note);

    const refs = [
      paymentId !== `PAY-${index + 1}` ? paymentId : null,
      mode || null,
      orderId ? `Order ${orderId}` : null,
    ].filter(Boolean);

    return {
      id: `payment-${paymentId}-${date}-${index}`,
      date,
      title: "Payment received",
      detail: `${formatInr(amount)}${refs.length ? ` · ${refs.join(" · ")}` : ""}`,
      subdetail: note || null,
      amount,
      paymentId,
      paymentMode: mode,
      orderId,
      kind: "payment",
    };
  });
}

/**
 * Non-payment activity: follow-up notes and fulfilled order references.
 */
export function buildNonPaymentActivityEvents({ collectionsNotes = "", openOrders = [] } = {}) {
  const events = [...parseCollectionsNotesTimeline(collectionsNotes)];

  for (const order of openOrders || []) {
    const date = str(order.fulfilledAt ?? order.updatedAt ?? order.orderDate ?? order.createdAt).slice(
      0,
      10
    );
    if (!date) continue;
    const amount = num(order.orderTotal);
    events.push({
      id: `fulfill-${order.orderId}-${date}`,
      date,
      title: "Order fulfilled",
      detail: `${order.orderId || "Order"} · ${formatInr(amount)} pending payment`,
      kind: "order",
    });
  }

  return events.sort((a, b) => eventTimestamp(b.date) - eventTimestamp(a.date));
}

/**
 * Merged activity feed: payments first (caller sorts), then other events.
 */
export function buildCollectionActivityTimeline({
  history = [],
  collectionsNotes = "",
  openOrders = [],
} = {}) {
  const paymentEvents = buildPaymentActivityEvents(history);
  const otherEvents = buildNonPaymentActivityEvents({ collectionsNotes, openOrders });
  return [...paymentEvents, ...otherEvents].sort((a, b) => eventTimestamp(b.date) - eventTimestamp(a.date));
}

export { buildPaymentActivityEvents, formatInr as formatActivityInr };
