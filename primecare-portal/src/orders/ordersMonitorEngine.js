import { collectOrderRowIds } from "@/metrics/computeRevenueMetrics.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const ORDER_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Amount high to low" },
  { value: "amount_asc", label: "Amount low to high" },
  { value: "status", label: "Status" },
  { value: "payment_pending", label: "Payment pending first" },
  { value: "lab_az", label: "Lab name A-Z" },
];

export const DEFAULT_ORDER_SORT = "newest";

const STATUS_PRIORITY = {
  placed: 0,
  processing: 1,
  fulfilled: 2,
  cancelled: 3,
};

const PAYMENT_PRIORITY = {
  pending: 0,
  partial: 1,
  "partially paid": 1,
  paid: 2,
  current: 2,
};

export function normalizeOrderStatusLabel(status) {
  const raw = str(status) || "Placed";
  const low = raw.toLowerCase();
  if (low === "cancelled") return "Cancelled";
  if (low === "fulfilled") return "Fulfilled";
  if (low === "processing") return "Processing";
  if (low === "placed" || low === "pending") return "Placed";
  return raw;
}

export function normalizePaymentStatusLabel(status) {
  const raw = str(status);
  if (!raw) return "Pending";
  const low = raw.toLowerCase();
  if (low === "paid" || low === "current") return "Paid";
  if (low === "partial" || low === "partially paid") return "Partial";
  if (low === "pending") return "Pending";
  return raw;
}

export function formatMissingField(value, fallback = "Not captured") {
  const v = str(value);
  return v || fallback;
}

function orderTimestamp(order) {
  const created = str(order.createdAt);
  if (created) {
    const t = new Date(created).getTime();
    if (Number.isFinite(t)) return t;
  }
  const date = str(order.orderDate);
  if (date) {
    const t = new Date(`${date}T12:00:00`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function statusSortKey(order) {
  return STATUS_PRIORITY[normalizeOrderStatusLabel(order.orderStatus).toLowerCase()] ?? 9;
}

function paymentSortKey(order) {
  return PAYMENT_PRIORITY[normalizePaymentStatusLabel(order.paymentStatus).toLowerCase()] ?? 5;
}

export function filterOrders(orders, filters = {}) {
  const q = str(filters.search).toLowerCase();
  const statusFilter = str(filters.status);
  const paymentFilter = str(filters.paymentStatus);
  const labFilter = str(filters.labId);
  const dateFrom = str(filters.dateFrom);
  const dateTo = str(filters.dateTo);

  let list = Array.isArray(orders) ? [...orders] : [];

  if (q) {
    list = list.filter((o) => {
      const hay = [
        o.orderId,
        o.labId,
        o.labName,
        o.orderStatus,
        o.paymentStatus,
        o.invoiceStatus,
        o.createdBy,
        o.notes,
      ]
        .map((v) => str(v).toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }

  if (statusFilter && statusFilter !== "ALL") {
    const want = normalizeOrderStatusLabel(statusFilter).toLowerCase();
    list = list.filter(
      (o) => normalizeOrderStatusLabel(o.orderStatus).toLowerCase() === want
    );
  }

  if (paymentFilter && paymentFilter !== "ALL") {
    const want = normalizePaymentStatusLabel(paymentFilter).toLowerCase();
    list = list.filter(
      (o) => normalizePaymentStatusLabel(o.paymentStatus).toLowerCase() === want
    );
  }

  if (labFilter && labFilter !== "ALL") {
    list = list.filter((o) => str(o.labId) === labFilter || str(o.labName) === labFilter);
  }

  if (dateFrom) {
    list = list.filter((o) => str(o.orderDate) >= dateFrom);
  }
  if (dateTo) {
    list = list.filter((o) => str(o.orderDate) <= dateTo);
  }

  return list;
}

export function sortOrders(orders, sortKey = DEFAULT_ORDER_SORT) {
  const list = Array.isArray(orders) ? [...orders] : [];

  list.sort((a, b) => {
    switch (sortKey) {
      case "oldest":
        return orderTimestamp(a) - orderTimestamp(b);
      case "amount_desc":
        return num(b.orderTotal) - num(a.orderTotal);
      case "amount_asc":
        return num(a.orderTotal) - num(b.orderTotal);
      case "status": {
        const diff = statusSortKey(a) - statusSortKey(b);
        return diff !== 0 ? diff : orderTimestamp(b) - orderTimestamp(a);
      }
      case "payment_pending": {
        const diff = paymentSortKey(a) - paymentSortKey(b);
        return diff !== 0 ? diff : orderTimestamp(b) - orderTimestamp(a);
      }
      case "lab_az": {
        const la = str(a.labName || a.labId).toLowerCase();
        const lb = str(b.labName || b.labId).toLowerCase();
        const diff = la.localeCompare(lb);
        return diff !== 0 ? diff : orderTimestamp(b) - orderTimestamp(a);
      }
      case "newest":
      default:
        return orderTimestamp(b) - orderTimestamp(a);
    }
  });

  return list;
}

export function computeOrdersKpis(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let placed = 0;
  let processing = 0;
  let fulfilled = 0;
  let cancelled = 0;
  let pendingPayment = 0;
  let totalValue = 0;

  for (const o of list) {
    const status = normalizeOrderStatusLabel(o.orderStatus).toLowerCase();
    if (status === "placed") placed += 1;
    else if (status === "processing") processing += 1;
    else if (status === "fulfilled") fulfilled += 1;
    else if (status === "cancelled") cancelled += 1;

    const payment = normalizePaymentStatusLabel(o.paymentStatus).toLowerCase();
    if (
      status !== "cancelled" &&
      (payment === "pending" || payment === "partial")
    ) {
      pendingPayment += 1;
    }

    totalValue += num(o.orderTotal);
  }

  return {
    totalOrders: list.length,
    placed,
    processing,
    fulfilled,
    cancelled,
    pendingPayment,
    totalOrderValue: totalValue,
  };
}

export function buildLabFilterOptions(orders) {
  const map = new Map();
  for (const o of orders || []) {
    const id = str(o.labId);
    const name = str(o.labName) || id;
    if (id) map.set(id, name);
    else if (name) map.set(name, name);
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatItemCount(count) {
  const n = num(count);
  return n === 1 ? "1 item" : `${n} items`;
}

/**
 * Compare API-mapped orders vs raw RLS rows for drift diagnostics.
 */
export function diagnoseOrdersReadDrift({ rawRows = [], mappedOrders = [], meta = null } = {}) {
  const rawIds = collectOrderRowIds(rawRows);
  const mappedIds = (mappedOrders || []).map((o) => str(o.orderId)).filter(Boolean).sort();
  const missingFromApi = rawIds.filter((id) => !mappedIds.includes(id));
  const extraInApi = mappedIds.filter((id) => !rawIds.includes(id));

  const drift =
    rawRows.length !== mappedOrders.length || missingFromApi.length > 0 || extraInApi.length > 0;

  return {
    drift,
    browserRlsCount: rawRows.length,
    apiMappedCount: mappedOrders.length,
    metaRawRowCount: meta?.rawRowCount ?? null,
    rawOrderIds: rawIds,
    mappedOrderIds: mappedIds,
    missingFromApi,
    extraInApi,
  };
}
