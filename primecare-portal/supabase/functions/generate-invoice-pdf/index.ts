// PrimeCare Invoice Phase 3 — generate invoice PDF from immutable snapshot.
// Deploy: supabase functions deploy generate-invoice-pdf
// Secrets: SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_ANON_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const ALLOWED_ORIGINS = new Set([
  "https://primecare-portal-prod.vercel.app",
  "https://primecare-portal.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

const CORS_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const CORS_ALLOW_METHODS = "POST, OPTIONS";

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

type Body = { invoiceId?: string; force?: boolean };

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const BUCKET = "invoice-pdfs";

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function formatMoney(value: number): string {
  return num(value).toFixed(2);
}

function formatDate(value: string): string {
  const s = str(value);
  if (!s) return "—";
  return s.slice(0, 10);
}

function storagePath(tenantId: string, invoiceId: string): string {
  return `${tenantId}/${invoiceId}.pdf`;
}

async function buildInvoicePdfBytes(payload: {
  invoiceNumber: string;
  invoiceDate: string;
  labName: string;
  labAddress: string;
  orderId: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: Array<{
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    lineTotal: number;
  }>;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${payload.invoiceNumber}`);
  pdf.setProducer("PrimeCare");
  pdf.setCreator("PrimeCare");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const { width, height } = page.getSize();
  const margin = 48;
  let y = height - margin;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size = 10,
    bold = false,
    color = rgb(0.1, 0.1, 0.1)
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const lineHeight = 14;

  drawText("PrimeCare Diagnostics Supplies", margin, y, 16, true);
  y -= 28;

  const meta = [
    ["Invoice Number", payload.invoiceNumber],
    ["Invoice Date", formatDate(payload.invoiceDate)],
    ["Lab Name", payload.labName || "—"],
    ["Lab Address", payload.labAddress || "—"],
    ["Order Reference", payload.orderId || "—"],
  ];
  for (const [label, value] of meta) {
    drawText(`${label}:`, margin, y, 10, true);
    drawText(value, margin + 120, y, 10, false);
    y -= lineHeight;
  }

  y -= 10;
  const cols = [
    { label: "SKU", x: margin, w: 70 },
    { label: "Product", x: margin + 72, w: 150 },
    { label: "Qty", x: margin + 226, w: 36 },
    { label: "Unit Price", x: margin + 266, w: 64 },
    { label: "Tax", x: margin + 334, w: 52 },
    { label: "Line Total", x: margin + 390, w: 70 },
  ];

  drawText("Line Items", margin, y, 11, true);
  y -= lineHeight;
  for (const col of cols) {
    drawText(col.label, col.x, y, 9, true, rgb(0.35, 0.35, 0.35));
  }
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= lineHeight;

  for (const line of payload.lines) {
    if (y < margin + 120) {
      page = pdf.addPage(pageSize);
      y = height - margin;
    }
    const values = [
      { text: line.sku || "—", x: cols[0].x, w: cols[0].w },
      { text: line.productName || "—", x: cols[1].x, w: cols[1].w },
      { text: String(line.quantity), x: cols[2].x, w: cols[2].w },
      { text: formatMoney(line.unitPrice), x: cols[3].x, w: cols[3].w },
      { text: formatMoney(line.taxAmount), x: cols[4].x, w: cols[4].w },
      { text: formatMoney(line.lineTotal), x: cols[5].x, w: cols[5].w },
    ];
    for (const cell of values) {
      const clipped = cell.text.length > 28 ? `${cell.text.slice(0, 27)}…` : cell.text;
      drawText(clipped, cell.x, y, 9, false);
    }
    y -= lineHeight;
  }

  y -= 8;
  page.drawLine({
    start: { x: margin + 260, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= lineHeight;

  const totals: Array<[string, string]> = [
    ["Subtotal", formatMoney(payload.subtotal)],
    ["Tax", formatMoney(payload.taxAmount)],
    ["Grand Total", formatMoney(payload.totalAmount)],
  ];
  for (const [label, value] of totals) {
    const bold = label === "Grand Total";
    drawText(label, margin + 300, y, 10, bold);
    drawText(value, margin + 390, y, 10, bold);
    y -= lineHeight;
  }

  drawText("Generated by PrimeCare", margin, margin, 9, false, rgb(0.45, 0.45, 0.45));

  return new Uint8Array(await pdf.save());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(req,{ success: false, error: "Server configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(req,{ success: false, error: "Missing authorization" }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req,{ success: false, error: "Invalid JSON body" }, 400);
  }

  const invoiceId = str(body.invoiceId);
  const force = Boolean(body.force);
  if (!invoiceId) {
    return jsonResponse(req,{ success: false, error: "invoiceId is required" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return jsonResponse(req,{ success: false, error: "Invalid session" }, 401);
  }

  const { data: invoice, error: invErr } = await userClient
    .from("invoices")
    .select(
      "id,tenant_id,lab_id,order_id,invoice_number,invoice_date,subtotal,tax_amount,total_amount,status,pdf_storage_path,pdf_generated_at"
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) {
    return jsonResponse(req,{ success: false, error: invErr.message }, 403);
  }
  if (!invoice) {
    return jsonResponse(req,{ success: false, error: "Invoice not found or access denied" }, 403);
  }

  const status = str(invoice.status).toLowerCase();
  if (status === "cancelled") {
    return jsonResponse(req,{ success: false, error: "Cannot generate PDF for cancelled invoice" }, 400);
  }

  const tenantId = str(invoice.tenant_id);
  const path = storagePath(tenantId, invoiceId);

  if (!force && str(invoice.pdf_storage_path)) {
    return jsonResponse(req,{
      success: true,
      invoiceId,
      pdf_storage_path: str(invoice.pdf_storage_path),
      reused: true,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lines, error: lineErr } = await adminClient
    .from("invoice_line_items")
    .select(
      "line_number,sku,product_id,product_name,quantity,unit_price,tax_amount,line_total"
    )
    .eq("invoice_id", invoiceId)
    .order("line_number", { ascending: true });

  if (lineErr) {
    return jsonResponse(req,{ success: false, error: lineErr.message }, 500);
  }

  const labId = str(invoice.lab_id);
  let labName = labId;
  let labAddress = "";
  if (labId) {
    const { data: labRow } = await adminClient
      .from("labs")
      .select("lab_name,area,owner_name,phone")
      .eq("tenant_id", tenantId)
      .eq("lab_id", labId)
      .maybeSingle();
    if (labRow) {
      labName = str(labRow.lab_name) || labName;
      const parts = [str(labRow.area), str(labRow.owner_name), str(labRow.phone)].filter(Boolean);
      labAddress = parts.join(" · ");
    }
  }

  const sortedLines = (lines || []).map((row) => ({
    sku: str(row.sku) || str(row.product_id),
    productName: str(row.product_name),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    taxAmount: num(row.tax_amount),
    lineTotal: num(row.line_total),
    lineNumber: num(row.line_number),
  }));
  sortedLines.sort((a, b) => a.lineNumber - b.lineNumber);

  const pdfBytes = await buildInvoicePdfBytes({
    invoiceNumber: str(invoice.invoice_number),
    invoiceDate: str(invoice.invoice_date),
    labName,
    labAddress,
    orderId: str(invoice.order_id),
    subtotal: num(invoice.subtotal),
    taxAmount: num(invoice.tax_amount),
    totalAmount: num(invoice.total_amount),
    lines: sortedLines,
  });

  const { error: uploadErr } = await adminClient.storage.from(BUCKET).upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (uploadErr) {
    return jsonResponse(req,{ success: false, error: uploadErr.message }, 500);
  }

  const nowIso = new Date().toISOString();
  const nextStatus = status === "draft" || status === "failed" ? "sent" : status;
  const updatePayload: Record<string, unknown> = {
    pdf_storage_path: path,
    pdf_generated_at: nowIso,
    updated_at: nowIso,
  };
  if (nextStatus === "sent" && status !== "sent" && status !== "paid") {
    updatePayload.status = "sent";
    updatePayload.sent_at = nowIso;
  }

  const { error: updateErr } = await adminClient
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId);

  if (updateErr) {
    return jsonResponse(req,{ success: false, error: updateErr.message }, 500);
  }

  return jsonResponse(req,{
    success: true,
    invoiceId,
    pdf_storage_path: path,
    reused: false,
    subtotal: num(invoice.subtotal),
    tax_amount: num(invoice.tax_amount),
    total_amount: num(invoice.total_amount),
  });
});
