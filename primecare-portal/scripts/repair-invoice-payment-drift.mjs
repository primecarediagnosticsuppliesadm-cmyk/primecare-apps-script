#!/usr/bin/env node
/**
 * Repair invoice/payment drift: finalize draft invoice (PDF) then allocate existing payment.
 *
 * Usage:
 *   node scripts/repair-invoice-payment-drift.mjs
 *   TEST_INVOICE_NUMBER=INV-2026-000047 node scripts/repair-invoice-payment-drift.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

async function main() {
  const env = loadEnv();
  const { sb, session } = await loginAdmin(env);
  const invoiceNumber = process.env.TEST_INVOICE_NUMBER || "INV-2026-000047";
  const orderId = process.env.TEST_ORDER_ID || "ORD-1782741100435-jpjjec";

  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("*")
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (invErr || !invoice) {
    throw new Error(invErr?.message || `Invoice ${invoiceNumber} not found`);
  }

  console.log("Invoice before:", {
    number: invoice.invoice_number,
    status: invoice.status,
    pdf: invoice.pdf_storage_path,
    sent_at: invoice.sent_at,
  });

  if (!invoice.pdf_storage_path || invoice.status === "draft") {
    console.log("Finalizing invoice (generate PDF → sent)...");
    await generateInvoicePdf(env, session, invoice.id);
    const { data: refreshed } = await sb
      .from("invoices")
      .select("status,pdf_storage_path,sent_at")
      .eq("id", invoice.id)
      .maybeSingle();
    console.log("Invoice after finalize:", refreshed);
    if (!refreshed?.pdf_storage_path || !["sent", "partially_paid", "paid"].includes(refreshed?.status)) {
      throw new Error("Invoice finalize failed — still not customer-facing");
    }
  }

  const { data: pays } = await sb
    .from("payments")
    .select("payment_id,amount_received")
    .eq("order_id", orderId);
  const { data: allocs } = await sb
    .from("invoice_payment_allocations")
    .select("payment_id,allocated_amount")
    .eq("invoice_id", invoice.id);
  const allocByPay = new Set((allocs || []).map((a) => a.payment_id));

  for (const pay of pays || []) {
    if (allocByPay.has(pay.payment_id)) {
      console.log(`Skip ${pay.payment_id} — already allocated`);
      continue;
    }
    const amount = num(pay.amount_received);
    if (amount <= 0) continue;
    const { data: openBal } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: invoice.id });
    const allocAmt = Math.min(amount, num(openBal));
    if (allocAmt <= 0) {
      console.log(`Skip ${pay.payment_id} — zero open balance`);
      continue;
    }
    console.log(`Allocating ${pay.payment_id} ₹${allocAmt}...`);
    const { data, error } = await sb.rpc("allocate_payment_to_invoice", {
      p_tenant_id: invoice.tenant_id,
      p_payment_id: pay.payment_id,
      p_invoice_id: invoice.id,
      p_allocated_amount: allocAmt,
      p_actor_id: "repair-invoice-payment-drift",
    });
    if (error) throw new Error(`allocate_payment_to_invoice: ${error.message}`);
    console.log("Allocation result:", data);
  }

  const { data: finalInv } = await sb
    .from("invoices")
    .select("status,total_amount")
    .eq("id", invoice.id)
    .maybeSingle();
  const { data: finalAllocs } = await sb
    .from("invoice_payment_allocations")
    .select("allocated_amount")
    .eq("invoice_id", invoice.id);
  const allocSum = (finalAllocs || []).reduce((s, a) => s + num(a.allocated_amount), 0);
  const { data: openBal } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: invoice.id });

  console.log("Repair complete:", {
    status: finalInv?.status,
    total: finalInv?.total_amount,
    allocated: allocSum,
    open: openBal,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
