# 06 — Finance Rules

Invoice, payment, allocation, and AR — strict lifecycle for Year-1 pilot.

---

## Canonical sources

| Metric | SoT |
|--------|-----|
| Lab collections outstanding | `ar_credit_control.outstanding` |
| Invoice open balance | `invoice.total - Σ(allocations)` |
| Invoice paid/partial status | `invoice_payment_allocations` + status enum |
| Order merchandise value | `orders.total_amount` (excludes delivery Phase 3A) |

---

## Invoice lifecycle

1. **draft** — created on fulfill RPC; not customer-facing
2. **Finalize** — PDF generated, `pdf_storage_path`, `sent_at`
3. **sent** — allocatable
4. **partially_paid** — partial allocation
5. **paid** — fully allocated
6. **cancelled / failed** — terminal

**Allocatability:** Requires customer-facing state (PDF + sent). Drafts excluded from lab open-invoice widgets.

**PDF reads:** `invoice_line_items` only — not live catalog.

---

## Payment lifecycle

1. `createPaymentWrite` validates lab + amount
2. Optional `order_id` → `finalizeInvoiceForOrderPayment`
3. `post_collection_payment` RPC (preferred)
4. AR outstanding reduced
5. `completeOrderLinkedPaymentAllocation` if invoice exists

**Compensation:** New payment + allocation failure → reverse AR + delete payment.

**Forbidden:** `payments.invoice_id` — junction only.

---

## Allocation rules

- RPC: `allocate_payment_to_invoice`
- Amount: `min(payment, open_balance)`
- Idempotent / over-alloc guards in RPC
- Partial payment → `partially_paid` with consistent open balance across modules

---

## Delivery charges (Phase 3A)

- **Not** in invoice subtotal
- **Not** in AR bump
- See [08_Delivery_Charge_Rules.md](./08_Delivery_Charge_Rules.md)

---

## Commission / payroll

- `commission_entries` separate from lab `payments`
- **Must not** alter payment allocation logic

---

## Do-not-break

1. No draft allocation without approved policy change
2. Finalize before allocate on order-linked payments
3. Fulfill does not roll back on invoice failure
4. Guntur tenant untouched by golden scripts
5. Bounded payment reads

---

## APIs

| Domain | Key functions |
|--------|---------------|
| Invoice | `createInvoiceForFulfilledOrderWrite`, `getInvoicesForLabRead`, `generateInvoicePdf` |
| Payment | `createPaymentWrite`, `allocatePaymentToInvoiceWrite` |
| Status | `invoiceAccountStatus.js`, `buildLabAccountLedger` |

---

## Verification

- `verify-financial-reconciliation.mjs`
- `verify-partial-payment-sync.mjs`
- `verify-invoice-phase1.mjs` – `phase5.mjs`
- `verify-primecare-production-golden-path.mjs`
