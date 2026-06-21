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

/**
 * Merged activity feed: payments, parsed follow-up notes, fulfilled order references.
 */
export function buildCollectionActivityTimeline({
  history = [],
  collectionsNotes = "",
  openOrders = [],
} = {}) {
  const events = [];

  for (const entry of history || []) {
    const amount = num(entry.amountCollected ?? entry.amount ?? 0);
    const date = str(entry.paymentDate ?? entry.payment_date ?? "").slice(0, 10);
    if (!date && amount <= 0) continue;
    events.push({
      id: entry.paymentId || `pay-${date}-${amount}`,
      date,
      title: amount > 0 ? "Payment received" : "Account update",
      detail:
        amount > 0
          ? `₹${amount.toLocaleString("en-IN")} collected${entry.paymentMode ? ` · ${entry.paymentMode}` : ""}`
          : str(entry.note) || "Collection update",
      kind: "payment",
    });
    const note = str(entry.note);
    if (note && amount > 0) {
      events.push({
        id: `${entry.paymentId || date}-note`,
        date,
        title: "Payment note",
        detail: note,
        kind: "note",
      });
    }
  }

  events.push(...parseCollectionsNotesTimeline(collectionsNotes));

  for (const order of openOrders || []) {
    const date = str(order.fulfilledAt ?? order.updatedAt ?? order.orderDate ?? order.createdAt).slice(
      0,
      10
    );
    if (!date) continue;
    const amount = num(order.orderTotal);
    events.push({
      id: `fulfill-${order.orderId}`,
      date,
      title: "Order fulfilled",
      detail: `${order.orderId || "Order"} · ₹${amount.toLocaleString("en-IN")} pending payment`,
      kind: "order",
    });
  }

  return events.sort((a, b) => eventTimestamp(b.date) - eventTimestamp(a.date));
}
