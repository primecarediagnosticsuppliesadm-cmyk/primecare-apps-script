import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_INVOICE_LINE_COLUMNS,
  HQ_INVOICE_LIST_COLUMNS,
  HQ_INVOICE_ALLOCATION_COLUMNS,
  HQ_INVOICE_LIST_DEFAULT_LIMIT,
  HQ_INVOICE_LIST_MAX_LIMIT,
  HQ_INVOICE_ORDER_LOOKUP_CHUNK,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { deriveInvoiceAccountStatus } from "@/collections/invoiceAccountStatus.js";

export const INVOICE_PDF_BUCKET = "invoice-pdfs";
export const INVOICE_SIGNED_URL_TTL_SEC = 300;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInvoiceUuid(value) {
  return UUID_RE.test(str(value));
}

export function mapInvoiceRow(row, allocationHint = {}) {
  if (!row) return null;
  const dueDate = str(row.due_date ?? row.dueDate).slice(0, 10);
  const invoiceDate = str(row.invoice_date ?? row.invoiceDate).slice(0, 10);
  const status = str(row.status);
  const id = str(row.id);
  const totalAmount = num(row.total_amount ?? row.totalAmount);
  const allocatedAmount = num(
    row.allocated_amount ??
      row.allocatedAmount ??
      allocationHint[id] ??
      allocationHint.allocatedAmount ??
      0
  );
  const openBalance = num(
    row.open_balance ?? row.openBalance ?? Math.max(0, totalAmount - allocatedAmount)
  );
  const sentAt = str(row.sent_at ?? row.sentAt);
  const displayStatus = deriveInvoiceAccountStatus({
    status,
    openBalance,
    paidAmount: allocatedAmount,
    allocatedAmount,
    dueDate,
    sentAt,
  });
  return {
    id,
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: str(row.lab_id ?? row.labId),
    orderId: str(row.order_id ?? row.orderId),
    invoiceNumber: str(row.invoice_number ?? row.invoiceNumber),
    invoiceDate,
    dueDate,
    subtotal: num(row.subtotal),
    taxAmount: num(row.tax_amount ?? row.taxAmount),
    totalAmount,
    allocatedAmount,
    openBalance,
    status,
    displayStatus,
    pdfStoragePath: str(row.pdf_storage_path ?? row.pdfStoragePath) || null,
    pdfGeneratedAt: str(row.pdf_generated_at ?? row.pdfGeneratedAt) || null,
    sentAt: str(row.sent_at ?? row.sentAt) || null,
    paidAt: str(row.paid_at ?? row.paidAt) || null,
    hasPdf: Boolean(str(row.pdf_storage_path ?? row.pdfStoragePath)),
  };
}

export function mapAllocationRow(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id ?? row.tenantId),
    paymentId: str(row.payment_id ?? row.paymentId),
    invoiceId: str(row.invoice_id ?? row.invoiceId),
    allocatedAmount: num(row.allocated_amount ?? row.allocatedAmount),
    createdAt: str(row.created_at ?? row.createdAt),
    createdBy: str(row.created_by ?? row.createdBy) || null,
  };
}

async function fetchAllocatedTotalsByInvoiceId(invoiceIds) {
  if (!supabase || !invoiceIds?.length) return {};
  const totals = {};
  const chunkSize = HQ_INVOICE_ORDER_LOOKUP_CHUNK;
  const ids = [...new Set(invoiceIds.map((id) => str(id)).filter(Boolean))];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("invoice_payment_allocations")
      .select("invoice_id,allocated_amount")
      .in("invoice_id", chunk);
    if (error) {
      console.warn("[fetchAllocatedTotalsByInvoiceId]", error.message);
      continue;
    }
    for (const row of data || []) {
      const key = str(row.invoice_id);
      totals[key] = (totals[key] || 0) + num(row.allocated_amount);
    }
  }
  return totals;
}

export function mapInvoiceLineRow(row) {
  return {
    lineNumber: num(row.line_number ?? row.lineNumber),
    orderId: str(row.order_id ?? row.orderId),
    productId: str(row.product_id ?? row.productId),
    productName: str(row.product_name ?? row.productName),
    sku: str(row.sku ?? row.product_id ?? row.productId),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price ?? row.unitPrice),
    taxRate: num(row.tax_rate ?? row.taxRate),
    taxAmount: num(row.tax_amount ?? row.taxAmount),
    lineTotal: num(row.line_total ?? row.lineTotal),
  };
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function escapeIlike(value) {
  return str(value).replace(/[%_\\]/g, "\\$&");
}

function applyInvoiceListFilters(query, filters = {}) {
  let q = query;
  const status = str(filters.status ?? filters.statusFilter).toLowerCase();
  if (status && status !== "all") {
    if (status === "overdue") {
      q = q.in("status", ["sent", "partially_paid"]).lt("due_date", todayYmd());
    } else {
      q = q.eq("status", status);
    }
  }
  const dateFrom = str(filters.dateFrom ?? filters.invoiceDateFrom);
  const dateTo = str(filters.dateTo ?? filters.invoiceDateTo);
  if (dateFrom) q = q.gte("invoice_date", dateFrom);
  if (dateTo) q = q.lte("invoice_date", dateTo);
  const invoiceNumber = str(filters.invoiceNumber ?? filters.invoiceNumberSearch);
  const orderNumber = str(filters.orderNumber ?? filters.orderNumberSearch);
  const search = str(filters.search ?? filters.q);
  if (invoiceNumber) {
    q = q.ilike("invoice_number", `%${escapeIlike(invoiceNumber)}%`);
  } else if (orderNumber) {
    q = q.ilike("order_id", `%${escapeIlike(orderNumber)}%`);
  } else if (search) {
    const term = escapeIlike(search);
    q = q.or(`invoice_number.ilike.%${term}%,order_id.ilike.%${term}%`);
  }
  return q;
}

function aggregateSum(row, key = "total_amount") {
  if (!row) return 0;
  const raw = row[`${key}.sum`] ?? row.sum ?? row[key];
  return num(raw);
}

/**
 * Bounded, paginated invoice list for a lab (RLS-scoped).
 */
export async function getInvoicesForLabRead(labId, options = {}) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured",
      rows: [],
      total: 0,
      page: 1,
      pageSize: HQ_INVOICE_LIST_DEFAULT_LIMIT,
    };
  }
  const labKey = str(labId);
  if (!labKey) {
    return {
      success: false,
      error: "lab_id is required",
      rows: [],
      total: 0,
      page: 1,
      pageSize: HQ_INVOICE_LIST_DEFAULT_LIMIT,
    };
  }

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = clampLimit(
    options.pageSize ?? options.limit,
    HQ_INVOICE_LIST_DEFAULT_LIMIT,
    HQ_INVOICE_LIST_MAX_LIMIT
  );
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("invoices")
    .select(HQ_INVOICE_LIST_COLUMNS, { count: "exact" })
    .eq("lab_id", labKey)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  query = applyInvoiceListFilters(query, options);

  const { data, error, count } = await query;
  if (error) {
    console.warn("[getInvoicesForLabRead]", error.message);
    return {
      success: false,
      error: error.message,
      rows: [],
      total: 0,
      page,
      pageSize,
    };
  }

  const allocationTotals = await fetchAllocatedTotalsByInvoiceId((data || []).map((r) => r.id));

  return {
    success: true,
    rows: (data || []).map((row) => mapInvoiceRow(row, allocationTotals)).filter(Boolean),
    total: Number(count) || 0,
    page,
    pageSize,
    error: null,
  };
}

/**
 * Batch invoice lookup by business order_id (single query per chunk, RLS-scoped).
 */
export async function getInvoicesByOrderIdsRead(orderIds, options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", byOrderId: {} };
  }
  const ids = [...new Set((orderIds || []).map((id) => str(id)).filter(Boolean))];
  if (!ids.length) {
    return { success: true, byOrderId: {}, error: null };
  }

  const tenantId = str(options.tenantId ?? options.tenant_id);
  const byOrderId = {};
  const chunkSize = HQ_INVOICE_ORDER_LOOKUP_CHUNK;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let query = supabase
      .from("invoices")
      .select(HQ_INVOICE_LIST_COLUMNS)
      .in("order_id", chunk);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) {
      console.warn("[getInvoicesByOrderIdsRead]", error.message);
      return { success: false, error: error.message, byOrderId };
    }
    for (const row of data || []) {
      const mapped = mapInvoiceRow(row);
      if (mapped?.orderId) byOrderId[mapped.orderId] = mapped;
    }
  }

  return { success: true, byOrderId, error: null };
}

/**
 * Read-only tenant invoice KPIs (allocation-based aggregates via RPC).
 */
export async function getInvoiceTenantKpisRead(tenantId, options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", kpis: null };
  }
  const tid = str(tenantId ?? options.tenant_id);
  if (!tid) {
    return { success: false, error: "tenant_id is required", kpis: null };
  }

  const { data, error } = await supabase.rpc("get_invoice_tenant_financial_kpis", {
    p_tenant_id: tid,
  });

  if (error) {
    return { success: false, error: error.message, kpis: null };
  }

  const payload = data || {};
  return {
    success: true,
    kpis: {
      totalInvoices: Number(payload.total_invoices) || 0,
      paidCount: Number(payload.paid_count) || 0,
      outstandingCount: Number(payload.outstanding_count) || 0,
      overdueCount: Number(payload.overdue_count) || 0,
      invoiceValue: num(payload.invoice_value),
      paidValue: num(payload.paid_value),
      outstandingValue: num(payload.outstanding_value),
      overdueValue: num(payload.overdue_value),
      unallocatedCash: num(payload.unallocated_cash),
      collectionPct: num(payload.collection_pct),
    },
    error: null,
  };
}

/**
 * Open balance for one invoice (RPC).
 */
export async function getInvoiceOpenBalanceRead(invoiceId) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", balance: null };
  }
  const id = str(invoiceId);
  if (!isInvoiceUuid(id)) {
    return { success: false, error: "Invalid invoice id", balance: null };
  }
  const { data, error } = await supabase.rpc("get_invoice_open_balance", { p_invoice_id: id });
  if (error) {
    return { success: false, error: error.message, balance: null };
  }
  return { success: true, balance: num(data), error: null };
}

/**
 * Allocations for an invoice (bounded, RLS-scoped).
 */
export async function getInvoiceAllocationsRead(invoiceId, options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", rows: [] };
  }
  const id = str(invoiceId);
  if (!isInvoiceUuid(id)) {
    return { success: false, error: "Invalid invoice id", rows: [] };
  }
  const limit = clampLimit(options.limit, 50, 100);
  const { data, error } = await supabase
    .from("invoice_payment_allocations")
    .select(HQ_INVOICE_ALLOCATION_COLUMNS)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return { success: false, error: error.message, rows: [] };
  }
  return {
    success: true,
    rows: (data || []).map(mapAllocationRow).filter(Boolean),
    error: null,
  };
}

/**
 * Allocate payment to invoice via RPC (idempotent on same amount).
 */
export async function allocatePaymentToInvoiceWrite({
  tenantId,
  paymentId,
  invoiceId,
  allocatedAmount,
  actorId,
} = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  const tid = str(tenantId);
  const pid = str(paymentId);
  const iid = str(invoiceId);
  const amount = num(allocatedAmount);
  if (!tid || !pid || !isInvoiceUuid(iid)) {
    return { success: false, error: "tenant_id, payment_id, and invoice_id are required", data: null };
  }
  if (amount <= 0) {
    return { success: false, error: "allocated_amount must be > 0", data: null };
  }

  const { data, error } = await supabase.rpc("allocate_payment_to_invoice", {
    p_tenant_id: tid,
    p_payment_id: pid,
    p_invoice_id: iid,
    p_allocated_amount: amount,
    p_actor_id: str(actorId) || null,
  });

  if (error) {
    return { success: false, error: error.message, data: null };
  }
  return { success: true, data, error: null };
}

/**
 * After payment write: auto-allocate to order-linked invoice when allocatable.
 */
export async function autoAllocatePaymentToOrderInvoice({
  tenantId,
  paymentId,
  orderId,
  amountReceived,
  actorId,
} = {}) {
  const tid = str(tenantId);
  const oid = str(orderId);
  const pid = str(paymentId);
  const received = num(amountReceived);
  if (!tid || !oid || !pid || received <= 0) {
    return { success: true, skipped: true, reason: "missing_args", data: null };
  }

  const invoiceRes = await getInvoiceByOrderRead(oid, { tenantId: tid });
  if (!invoiceRes.success || !invoiceRes.data?.id) {
    return { success: true, skipped: true, reason: "no_invoice", data: null };
  }

  const invoice = invoiceRes.data;
  if (!["sent", "partially_paid"].includes(str(invoice.status))) {
    return { success: true, skipped: true, reason: "invoice_not_allocatable", data: null };
  }

  const balanceRes = await getInvoiceOpenBalanceRead(invoice.id);
  const openBalance = balanceRes.success ? num(balanceRes.balance) : num(invoice.openBalance);
  const allocAmount = Math.min(received, openBalance);
  if (allocAmount <= 0) {
    return { success: true, skipped: true, reason: "zero_open_balance", data: null };
  }

  const allocRes = await allocatePaymentToInvoiceWrite({
    tenantId: tid,
    paymentId: pid,
    invoiceId: invoice.id,
    allocatedAmount: allocAmount,
    actorId,
  });

  if (!allocRes.success) {
    console.warn("[autoAllocatePaymentToOrderInvoice]", allocRes.error);
    return { success: false, skipped: false, error: allocRes.error, data: null };
  }

  return { success: true, skipped: false, data: allocRes.data, error: null };
}

/**
 * Resolve invoice by business order_id (RLS-scoped).
 */
export async function getInvoiceByOrderRead(orderId, options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  const oid = str(orderId);
  if (!oid) {
    return { success: false, error: "order_id is required", data: null };
  }

  let query = supabase
    .from("invoices")
    .select(HQ_INVOICE_LIST_COLUMNS)
    .eq("order_id", oid)
    .limit(1);

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.warn("[getInvoiceByOrderRead]", error.message);
    return { success: false, error: error.message, data: null };
  }
  if (!data) {
    return { success: false, error: "Invoice not found for order", data: null };
  }
  return { success: true, data: mapInvoiceRow(data), error: null };
}

/**
 * Invoice header + immutable line snapshot.
 */
export async function getInvoiceDetailRead(invoiceId) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  const id = str(invoiceId);
  if (!isInvoiceUuid(id)) {
    return { success: false, error: "Invalid invoice id", data: null };
  }

  const { data: header, error: hErr } = await supabase
    .from("invoices")
    .select(HQ_INVOICE_LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (hErr) {
    return { success: false, error: hErr.message, data: null };
  }
  if (!header) {
    return { success: false, error: "Invoice not found", data: null };
  }

  const { data: lines, error: lErr } = await supabase
    .from("invoice_line_items")
    .select(HQ_INVOICE_LINE_COLUMNS)
    .eq("invoice_id", id)
    .order("line_number", { ascending: true });

  if (lErr) {
    return { success: false, error: lErr.message, data: null };
  }

  return {
    success: true,
    data: {
      invoice: mapInvoiceRow(header),
      lines: (lines || []).map(mapInvoiceLineRow),
    },
    error: null,
  };
}

/**
 * Generate PDF via edge function (invoice snapshot only server-side).
 */
export async function generateInvoicePdf(invoiceId, options = {}) {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  const id = str(invoiceId);
  if (!isInvoiceUuid(id)) {
    return { success: false, error: "Invalid invoice id", data: null };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { success: false, error: "Not authenticated", data: null };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-invoice-pdf`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoiceId: id,
        force: Boolean(options.force),
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.error || body?.message || `HTTP ${res.status}`;
      return { success: false, error: message, data: null };
    }
    return { success: true, data: body, error: null };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Signed download URL (RLS + storage policy).
 */
export async function getInvoicePdfSignedUrl(invoiceId, ttlSeconds = INVOICE_SIGNED_URL_TTL_SEC) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", url: null, expiresAt: null };
  }
  const id = str(invoiceId);
  if (!isInvoiceUuid(id)) {
    return { success: false, error: "Invalid invoice id", url: null, expiresAt: null };
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("pdf_storage_path,status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return { success: false, error: invErr.message, url: null, expiresAt: null };
  }
  const path = str(inv?.pdf_storage_path);
  if (!path) {
    return { success: false, error: "PDF_NOT_READY", url: null, expiresAt: null };
  }

  const ttl = Math.min(Math.max(Number(ttlSeconds) || INVOICE_SIGNED_URL_TTL_SEC, 60), 3600);
  const { data, error } = await supabase.storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(path, ttl);

  if (error) {
    return { success: false, error: error.message, url: null, expiresAt: null };
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return { success: true, url: data?.signedUrl || null, expiresAt, error: null };
}

/**
 * Resolve invoice id, ensure PDF exists, return signed URL.
 */
export async function ensureInvoicePdfAndGetSignedUrl({
  invoiceId,
  orderId,
  tenantId,
  forceGenerate = false,
} = {}) {
  let resolvedId = isInvoiceUuid(invoiceId) ? str(invoiceId) : "";

  if (!resolvedId && orderId) {
    const byOrder = await getInvoiceByOrderRead(orderId, { tenantId });
    if (byOrder.success && byOrder.data?.id) {
      resolvedId = byOrder.data.id;
    }
  }

  if (!resolvedId) {
    return { success: false, error: "Invoice not found", url: null };
  }

  let detail = await getInvoiceDetailRead(resolvedId);
  if (!detail.success) {
    return { success: false, error: detail.error || "Invoice not found", url: null };
  }

  if (!detail.data?.invoice?.hasPdf || forceGenerate) {
    const gen = await generateInvoicePdf(resolvedId, { force: forceGenerate });
    if (!gen.success) {
      return { success: false, error: gen.error || "PDF generation failed", url: null };
    }
    detail = await getInvoiceDetailRead(resolvedId);
  }

  const signed = await getInvoicePdfSignedUrl(resolvedId);
  if (!signed.success || !signed.url) {
    return { success: false, error: signed.error || "Signed URL failed", url: null };
  }

  return {
    success: true,
    url: signed.url,
    expiresAt: signed.expiresAt,
    invoiceId: resolvedId,
    invoice: detail.data?.invoice || null,
    error: null,
  };
}
