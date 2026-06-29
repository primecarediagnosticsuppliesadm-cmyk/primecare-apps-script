#!/usr/bin/env node
/**
 * Payment allocation flow — static wiring checks (canonical APIs only).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const primeApi = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
const invoiceApi = readFileSync(resolve(root, "src/api/invoiceSupabaseApi.js"), "utf8");
const collections = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const sqlPath = resolve(root, "supabase/migrations/20260624120005_invoice_system_phase5.sql");

assert(existsSync(sqlPath), "phase5 migration missing");
const sql = readFileSync(sqlPath, "utf8");

assert(/export async function createPaymentWrite/.test(primeApi), "createPaymentWrite export");
assert(/autoAllocatePaymentToOrderInvoice/.test(primeApi), "payment auto-allocation hook");
assert(/allocate_payment_to_invoice/.test(sql), "allocate_payment_to_invoice RPC in SQL");
assert(/allocatePaymentToInvoiceWrite/.test(invoiceApi), "allocatePaymentToInvoiceWrite");
assert(/autoAllocatePaymentToOrderInvoice/.test(invoiceApi), "autoAllocatePaymentToOrderInvoice");
assert(/createPaymentWrite\(/.test(collections), "Collections uses createPaymentWrite");
assert(/resolvePaymentOrderIdForLab/.test(collections), "order-linked payment resolution");
assert(/paymentOrderId/.test(collections), "payment order context wired");

console.log("PASS — payment allocation flow wiring");
