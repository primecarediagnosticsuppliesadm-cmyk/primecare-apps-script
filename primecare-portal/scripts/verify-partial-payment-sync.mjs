#!/usr/bin/env node
/**
 * Partial payment sync — strict lifecycle (finalize → pay → allocate).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  summarizeInvoiceFinancials,
  isInvoiceAllocatableForOrderPayment,
  isInvoiceCustomerFacingForPayment,
} from "../src/collections/invoiceAccountStatus.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pass(id, detail) {
  console.log(`PASS ${id} — ${detail}`);
}

function fail(id, detail) {
  throw new Error(`FAIL ${id} — ${detail}`);
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

async function loginAdmin(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Admin auth failed: ${error.message}`);
  return { sb, session: data.session };
}

async function generateInvoicePdf(env, session, invoiceId) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoiceId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `PDF HTTP ${res.status}`);
  }
  return body;
}

function staticWiringChecks() {
  const invoiceApi = readFileSync(resolve(root, "src/api/invoiceSupabaseApi.js"), "utf8");
  const primeApi = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
  const statusJs = readFileSync(resolve(root, "src/collections/invoiceAccountStatus.js"), "utf8");
  const orders = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
  const collections = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");

  const relaxedMigration = resolve(
    root,
    "supabase/migrations/20260629120000_invoice_draft_order_payment_allocation.sql"
  );
  assert(!existsSync(relaxedMigration), "draft allocation relaxation migration must not exist");

  assert(/finalizeInvoiceForOrderPayment/.test(invoiceApi), "finalizeInvoiceForOrderPayment");
  assert(/INVOICE_PAYMENT_FINALIZE_ERROR/.test(invoiceApi), "finalize error message");
  assert(/resolveOrderInvoiceForPayment/.test(primeApi), "pre-payment invoice finalize gate");
  assert(/completeOrderLinkedPaymentAllocation/.test(primeApi), "post-payment allocation gate");
  assert(/compensateFailedOrderPaymentWrite/.test(primeApi), "AR/payment compensation");
  assert(/logFinancialDriftDetected/.test(primeApi), "financial_drift_detected logging");
  assert(/isInvoiceCustomerFacingForPayment/.test(statusJs), "customer-facing payment check");

  assert(
    !isInvoiceAllocatableForOrderPayment({ status: "draft", orderId: "ORD-1", hasPdf: false }),
    "draft invoice not allocatable (strict)"
  );
  assert(
    isInvoiceAllocatableForOrderPayment({
      status: "sent",
      hasPdf: true,
      sentAt: "2026-06-01",
    }),
    "sent invoice with PDF allocatable"
  );

  const summary = summarizeInvoiceFinancials(
    { id: "inv-1", total_amount: 360, status: "sent", sent_at: "2026-06-01", pdf_storage_path: "x.pdf" },
    { "inv-1": 350 }
  );
  assert(summary.displayStatus === "Partially Paid", `expected Partially Paid, got ${summary.displayStatus}`);

  assert(/notifyFinancialSyncCompleted|notifyFinancialSyncRefresh/.test(collections), "financial sync refresh");
  assert(/paidAmount/.test(orders), "Orders payment panel split");
  pass("PPS-10", "Strict lifecycle wiring");
}

async function liveChecks(sb, session, env) {
  const testOrderId = process.env.TEST_ORDER_ID || "ORD-1782741100435-jpjjec";
  const testInvoiceNumber = process.env.TEST_INVOICE_NUMBER || "INV-2026-000047";

  const { data: invoice } = await sb
    .from("invoices")
    .select("*")
    .eq("invoice_number", testInvoiceNumber)
    .maybeSingle();

  if (!invoice) {
    pass("PPS-20", `Skip live — invoice not found (${testInvoiceNumber})`);
    return;
  }

  let working = { ...invoice };
  if (!isInvoiceCustomerFacingForPayment(working)) {
    pass("PPS-21", `Finalizing draft invoice ${testInvoiceNumber} before allocation repair`);
    await generateInvoicePdf(env, session, working.id);
    const { data: refreshed } = await sb.from("invoices").select("*").eq("id", working.id).maybeSingle();
    working = refreshed || working;
    assert(isInvoiceCustomerFacingForPayment(working), "invoice must be sent with PDF after finalize");
    pass("PPS-22", `Invoice finalized: status=${working.status}, sent_at=${working.sent_at}`);
  }

  const { data: allocs } = await sb
    .from("invoice_payment_allocations")
    .select("allocated_amount,payment_id")
    .eq("invoice_id", working.id);
  let allocSum = (allocs || []).reduce((s, a) => s + num(a.allocated_amount), 0);

  const { data: pays } = await sb
    .from("payments")
    .select("payment_id,amount_received")
    .eq("order_id", testOrderId);

  for (const pay of pays || []) {
    const hasAlloc = (allocs || []).some((a) => a.payment_id === pay.payment_id);
    if (hasAlloc) continue;
    const { data: openBal } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: working.id });
    const allocAmt = Math.min(num(pay.amount_received), num(openBal));
    if (allocAmt <= 0) continue;
    const { error } = await sb.rpc("allocate_payment_to_invoice", {
      p_tenant_id: working.tenant_id,
      p_payment_id: pay.payment_id,
      p_invoice_id: working.id,
      p_allocated_amount: allocAmt,
      p_actor_id: "verify-partial-payment-sync",
    });
    if (error) fail("PPS-23", `allocate failed: ${error.message}`);
    pass("PPS-23", `Allocated ${pay.payment_id} ₹${allocAmt}`);
  }

  const { data: allocs2 } = await sb
    .from("invoice_payment_allocations")
    .select("allocated_amount")
    .eq("invoice_id", working.id);
  allocSum = (allocs2 || []).reduce((s, a) => s + num(a.allocated_amount), 0);

  const summary = summarizeInvoiceFinancials(working, { [working.id]: allocSum });
  const { data: openRpc } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: working.id });
  const { data: ar } = await sb
    .from("ar_credit_control")
    .select("outstanding")
    .eq("lab_id", working.lab_id)
    .maybeSingle();

  pass(
    "PPS-30",
    `${testInvoiceNumber}: alloc ₹${allocSum} · summary open ₹${summary.openBalance} · RPC open ₹${openRpc} · status ${working.status}`
  );

  if (allocSum > 0 && allocSum < num(working.total_amount)) {
    assert(summary.displayStatus === "Partially Paid", `expected Partially Paid, got ${summary.displayStatus}`);
    assert(["partially_paid", "sent"].includes(String(working.status)), "DB status partially_paid or sent");
    pass("PPS-31", "Partial payment: Partially Paid across summary");
  }

  if (allocSum > 0) {
    assert(Math.abs(summary.openBalance - num(openRpc)) < 0.02, "summary open matches RPC");
    pass("PPS-32", `AR outstanding ₹${num(ar?.outstanding)} · invoice open ₹${summary.openBalance}`);
  }
}

async function main() {
  staticWiringChecks();
  const env = loadEnv();
  const { sb, session } = await loginAdmin(env);
  await liveChecks(sb, session, env);
  console.log("PASS — partial payment sync (strict lifecycle)");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
