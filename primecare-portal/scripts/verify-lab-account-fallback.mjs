#!/usr/bin/env node
/**
 * Lab Payments & Account fallback summary checks.
 */
import { buildLabAccountFallbackSummary } from "../src/collections/labAccountFallbackSummary.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const paidInvoices = [
  { invoiceNumber: "INV-1", status: "paid", totalAmount: 100, openBalance: 0 },
  { invoiceNumber: "INV-2", status: "paid", totalAmount: 200, openBalance: 0 },
];
const openInvoices = [
  { invoiceNumber: "INV-3", status: "sent", totalAmount: 150, openBalance: 150 },
];
const payments = [
  { amountCollected: 300 },
  { amountCollected: 200 },
];

const fullyPaid = buildLabAccountFallbackSummary(paidInvoices, payments, 2);
assert(fullyPaid.fullyPaid === true, "expected fully paid");
assert(fullyPaid.invoiceCount === 2, "invoice count");
assert(fullyPaid.openBalance === 0, "open balance zero");
assert(fullyPaid.totalPaid === 500, "total paid from payments");

const withOpen = buildLabAccountFallbackSummary(
  [...paidInvoices, ...openInvoices],
  payments,
  3
);
assert(withOpen.fullyPaid === false, "not fully paid when open balance");
assert(withOpen.openBalance === 150, "open balance sum");

const noPayments = buildLabAccountFallbackSummary(paidInvoices, [], 2);
assert(noPayments.totalPaid === 300, "falls back to paid invoice totals");

console.log("PASS — lab account fallback summary");
console.log(JSON.stringify({ fullyPaid, withOpen, noPayments }, null, 2));
