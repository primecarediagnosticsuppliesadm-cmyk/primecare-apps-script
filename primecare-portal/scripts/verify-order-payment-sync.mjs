#!/usr/bin/env node
/**
 * Order ↔ payment ↔ invoice UI sync — static wiring checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const orders = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const collections = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const invoiceApi = readFileSync(resolve(root, "src/api/invoiceSupabaseApi.js"), "utf8");
const primeApi = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
const nav = readFileSync(resolve(root, "src/operations/hqWorkflowNav.js"), "utf8");
const creditRisk = readFileSync(
  resolve(root, "src/components/hq/HqCreditRiskCommandCenter.jsx"),
  "utf8"
);

assert(/downloadInvoicePdf/.test(orders), "Orders uses shared downloadInvoicePdf");
assert(/onPhase/.test(orders), "Orders download has onPhase feedback");
assert(/Record Payment/.test(orders), "Orders Record Payment action");
assert(/focusSection:\s*"payment"/.test(orders), "Orders navigates with payment focus");
assert(/orderId:/.test(nav), "hqWorkflowNav passes orderId context");
assert(/paymentAmount/.test(nav), "hqWorkflowNav passes paymentAmount context");
assert(/finalizeInvoiceForOrderPayment/.test(invoiceApi), "finalize before payment");
assert(/financial_drift_detected|logFinancialDriftDetected/.test(primeApi), "drift detection");
assert(/invalidateOrdersReadCache/.test(collections), "payment invalidates orders cache");
assert(/invalidateCollectionsReadCache/.test(collections), "payment invalidates collections cache");
assert(/notifyFinancialSyncRefresh/.test(collections), "payment notifies financial sync");
assert(/onFinancialSyncRefresh/.test(orders), "Orders listens for financial sync");
assert(/paidAmount/.test(orders), "Orders shows paid amount in payment panel");
assert(/isHqCreditRisk[\s\S]*paymentDrawerLabId/.test(collections), "HQ credit risk payment drawer");
assert(/onRecordPayment/.test(creditRisk), "Credit & Risk Record Payment action");

console.log("PASS — order payment sync wiring");
