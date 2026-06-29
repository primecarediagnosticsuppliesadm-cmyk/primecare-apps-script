#!/usr/bin/env node
/**
 * Invoice / account status derivation checks.
 */
import {
  deriveInvoiceAccountStatus,
  deriveAccountHealthStatus,
  deriveLabPaymentStatus,
  deriveOpenInvoiceWidgetStatus,
  isCustomerFacingOpenInvoice,
  isInternalDraftInvoice,
} from "../src/collections/invoiceAccountStatus.js";
import { buildLabAccountLedger } from "../src/collections/labAccountLedger.js";
import {
  buildLabAccountActivityTimeline,
  filterValidInvoices,
  formatCreditKpiDisplay,
  sanitizeTimelineEvents,
} from "../src/collections/labAccountActivity.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const openSent = deriveInvoiceAccountStatus({
  status: "sent",
  openBalance: 30000,
  paidAmount: 0,
  allocatedAmount: 0,
  dueDate: "2026-07-15",
});
assert(openSent === "Sent", `expected Sent, got ${openSent}`);

const partial = deriveInvoiceAccountStatus({
  status: "sent",
  openBalance: 10000,
  paidAmount: 0,
  allocatedAmount: 20000,
  dueDate: "2026-07-15",
});
assert(partial === "Partially Paid", `expected Partially Paid, got ${partial}`);

const overdue = deriveInvoiceAccountStatus({
  status: "sent",
  openBalance: 5000,
  allocatedAmount: 0,
  dueDate: "2020-01-01",
});
assert(overdue === "Overdue", `expected Overdue, got ${overdue}`);

const health = deriveAccountHealthStatus({
  outstandingAmount: 30000,
  totalPaid: 0,
  totalAllocated: 0,
  overdueDays: 0,
});
assert(health.label === "Outstanding", `expected Outstanding, got ${health.label}`);
assert(health.label !== "Partially Paid", "must not show Partially Paid when unpaid");
assert(health.tone.includes("sky"), "outstanding health uses sky tone");

const partialHealth = deriveAccountHealthStatus({
  outstandingAmount: 10000,
  totalPaid: 5000,
  totalAllocated: 0,
  overdueDays: 0,
});
assert(partialHealth.label === "Partially Paid", "partial when paid > 0");

const activity = buildLabAccountActivityTimeline({
  item: { outstandingAmount: 30000 },
  history: [],
  invoices: [
    {
      invoiceId: "INV-2026-000001",
      orderId: "ORD-1",
      totalAmount: 30000,
      openBalance: 30000,
      allocatedAmount: 0,
      invoiceDate: "2026-06-01",
      sentAt: "2026-06-01",
      status: "Sent",
    },
  ],
  formatMoney: (v) => `₹${v}`,
  formatShortDate: (v) => String(v).slice(0, 10),
});
assert(activity.length > 0, "activity timeline should include invoice lifecycle");
assert(
  activity.some((row) => String(row.title).includes("Invoice Sent")),
  "activity should include invoice sent event"
);
assert(
  activity.some((row) => Array.isArray(row.lines) && row.lines.length > 0),
  "activity rows should have structured lines"
);

const nullSafeActivity = buildLabAccountActivityTimeline({
  item: { outstandingAmount: 0 },
  history: [null, { amountCollected: 100, paymentMode: "cash", orderId: "ORD-9", paymentDate: "2026-06-15" }],
  invoices: [null],
  formatMoney: (v) => `₹${v}`,
});
assert(nullSafeActivity.length > 0, "null inputs should not crash timeline");
assert(
  nullSafeActivity.some((row) => row.title === "Payment received"),
  "payment event renders without invoice linkage"
);
assert(
  nullSafeActivity.some(
    (row) => row.kind === "payment" && row.lines?.some((l) => l.includes("Applied to order ORD-9"))
  ),
  "payment without invoiceId falls back to order reference"
);

assert(sanitizeTimelineEvents([null, { title: "Ok", date: "2026-01-01" }]).length === 1, "sanitize drops null");
assert(filterValidInvoices([null, { invoiceId: "X" }]).length === 1, "filter drops null invoices");

const emptyActivity = buildLabAccountActivityTimeline({
  item: { outstandingAmount: 0 },
  history: [],
  invoices: [],
  formatMoney: (v) => `₹${v}`,
});
assert(Array.isArray(emptyActivity) && emptyActivity.length === 0, "empty history returns empty timeline");

const internalDraft = isInternalDraftInvoice({ status: "draft", sentAt: "", hasPdf: false });
assert(internalDraft === true, "unsent draft is internal");

const customerOpen = isCustomerFacingOpenInvoice({
  status: "draft",
  openBalance: 100,
  sentAt: "",
  hasPdf: false,
});
assert(customerOpen === false, "internal draft excluded from open invoices");

const sentOpen = isCustomerFacingOpenInvoice({
  status: "sent",
  openBalance: 100,
  sentAt: "2026-06-01",
});
assert(sentOpen === true, "sent open invoice is customer-facing");

const widgetStatus = deriveOpenInvoiceWidgetStatus({
  status: "sent",
  openBalance: 100,
  paidAmount: 0,
  allocatedAmount: 0,
  dueDate: "2026-07-15",
  sentAt: "2026-06-01",
});
assert(widgetStatus === "Outstanding", `expected Outstanding widget status, got ${widgetStatus}`);

const creditKpi = formatCreditKpiDisplay(0, 100, (v) => `₹${v}`);
assert(creditKpi.label === "Credit Policy", "no limit uses Credit Policy label");
assert(creditKpi.value === "Not configured", "no limit shows Not configured");

const creditAvail = formatCreditKpiDisplay(50000, 10000, (v) => `₹${v}`);
assert(creditAvail.label === "Available Credit", "limit uses Available Credit label");

const paymentActivity = buildLabAccountActivityTimeline({
  item: { outstandingAmount: 0 },
  history: [{ amountCollected: 100, paymentMode: "cash", invoiceId: "INV-2026-000046", paymentDate: "2026-06-15" }],
  invoices: [],
  formatMoney: (v) => `₹${v}`,
});
const payRow = paymentActivity.find((row) => row.kind === "payment");
assert(payRow?.title === "Payment received", "payment activity uses descriptive title");
assert(
  payRow?.lines?.some((line) => line.includes("INV-2026-000046")),
  "payment activity references invoice"
);

const ledger = buildLabAccountLedger({
  invoices: [
    {
      invoiceNumber: "INV-2026-000001",
      status: "sent",
      totalAmount: 30000,
      openBalance: 30000,
      allocatedAmount: 0,
      dueDate: "2026-07-15",
    },
  ],
  paymentHistory: [],
  labId: "LAB-1",
});
assert(
  ledger.collectionItem.paymentStatus === "Outstanding",
  `expected Outstanding payment status, got ${ledger.collectionItem.paymentStatus}`
);
assert(
  deriveLabPaymentStatus({
    outstandingAmount: 30000,
    totalPaid: 0,
    totalAllocated: 0,
  }) === "Outstanding",
  "lab payment status unpaid"
);

console.log("PASS — invoice account status");
console.log(JSON.stringify({ openSent, partial, health: health.label, ledgerStatus: ledger.collectionItem.paymentStatus }, null, 2));
