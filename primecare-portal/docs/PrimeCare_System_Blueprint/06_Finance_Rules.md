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
| Payroll commission input | `payments.amount_received` cash actually collected only |

Agent-created `PROSPECT` Labs (Flow 2A `create_prospect_lab`) must **not** insert `ar_credit_control`. Flow 2C `activate_prospect_lab` creates the initial AR row using the same defaults as HQ `create_lab_with_ar_credit` (`credit_limit` 0, `outstanding`/`total_delivered`/`total_paid` 0, `collections_notes` NULL). Do not invent a second credit policy. Repeat activation must not insert a second AR row.

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

1. `createPaymentWrite` validates lab + amount + `client_request_id`
2. Optional `order_id` → `finalizeInvoiceForOrderPayment` (draft must become customer-facing before allocate)
3. **Only** `post_collection_payment` RPC — fail closed if the RPC is missing or errors
4. Linked path (`order_id` present): one transaction creates the payment, reduces AR, inserts `invoice_payment_allocations`, and syncs invoice status
5. Unlinked path (no `order_id`): one transaction creates the payment and reduces AR; no allocation

**Forbidden:** client INSERT/UPDATE/DELETE on `payments`; client UPDATE of AR financial columns; compensation-by-delete; `payments.invoice_id`.

**EXECUTE least privilege (Flow 3A follow-up):** `anon` and `PUBLIC` must not have EXECUTE on `post_collection_payment` or `post_fulfillment_ar_bump`. `authenticated` is granted EXECUTE (role/RLS/`forbidden` still gate Lab vs HQ/Agent). `service_role` may retain EXECUTE for trusted server operations. Function bodies are unchanged. QA migration `20260907120000` (do not apply to Production from this follow-up).

**Overpayment (Flow 3A):** reject when `amount_received` exceeds AR `outstanding`, or (linked) exceeds invoice open balance. Do not floor with `GREATEST(0, outstanding - amount)` to hide surplus. No unapplied-cash subsystem in 3A.

---

## Allocation rules

- RPC: `allocate_payment_to_invoice`
- Amount: `min(payment, open_balance)`
- Idempotent / over-alloc guards in RPC
- Partial payment → `partially_paid` with consistent open balance across modules

---

## Fulfill AR posting

- Client path: `bumpArOutstandingForFulfillment` → **`post_fulfillment_ar_bump` RPC** from `updateOrderStatusWrite` / `createOrderWrite` when status becomes Fulfilled, `ar_posted` is not already true, lab_id is present, and merchandise amount > 0.
- Amount: `orders.total_amount` (merchandise). Delivery estimate is not added.
- Authenticated clients must not UPDATE `outstanding` / `total_paid` / `total_delivered`. Trigger `ar_credit_protect_financial_columns` enforces RPC-only financial mutation. Table `GRANT UPDATE` remains for operational columns (notes/follow-up/`updated_at`) and Lab Ordering 1H probes.
- Idempotency: `orders.ar_posted` inside the RPC.

## Delivery charges (Phase 3A)

- **Not** in invoice subtotal
- **Not** in AR bump
- See [08_Delivery_Charge_Rules.md](./08_Delivery_Charge_Rules.md)

---

## Commission / payroll

- Existing distributor/revenue-based commission analytics are **not** the payroll source of truth.
- HQ compensation/payroll must derive commission from cash actually collected only: `attributable_cash_collected × applicable_rate`.
- Forbidden payroll commission inputs: order value, invoice value, fulfilled revenue, projected revenue, outstanding receivables, and allocation totals as commission amount.
- `payments.agent_id` is the preferred future attribution source when populated and certified; otherwise use an audited active `lab_ownership` snapshot at payment date.
- Payroll tables are derived ledgers separate from lab `payments`.
- **Must not** alter payment allocation logic, AR logic, invoices, orders, inventory, logistics, or accounting.
- No accounting entry, bank payout, GL posting, or disbursement record is created unless explicitly approved in a future finance/payroll phase.
- Phase 3B preview may write draft rows only to compensation/payroll tables and audit calculation start/finish; it must not write approval/export events or mutate Finance/O2C source records.
- Phase 3C `paid` is payroll-domain evidence only. It must not write `payments`, AR, allocations, invoices, orders, bank files, GL, accounting entries, or disbursement tables.

---

## Do-not-break

1. No draft allocation without approved policy change
2. Finalize before allocate on order-linked payments
3. Fulfill does not roll back on invoice failure
4. Guntur tenant untouched by golden scripts
5. Bounded payment reads
6. Compensation/payroll does not mutate finance SoT and does not compute commission from revenue or receivables
7. Payment posting is atomic in `post_collection_payment` (linked: payment + AR + allocation). Fail closed. No client compensation-by-delete.

---

## APIs

| Domain | Key functions |
|--------|---------------|
| Invoice | `createInvoiceForFulfilledOrderWrite`, `getInvoicesForLabRead`, `generateInvoicePdf` |
| Payment | `createPaymentWrite` → `post_collection_payment` (fail closed; `client_request_id` required), `allocatePaymentToInvoiceWrite` (repair/legacy allocate) |
| Fulfill AR | `bumpArOutstandingForFulfillment` → `post_fulfillment_ar_bump` |
| Status | `invoiceAccountStatus.js`, `buildLabAccountLedger` |
| Compensation / payroll | Phase 3B preview calculation APIs and Phase 3C payroll-domain workflow APIs; see `19_Executive_Compensation_Payroll_Engine.md` |

---

## Verification

- `verify-flow-3a.mjs`
- `verify-financial-reconciliation.mjs`
- `verify-partial-payment-sync.mjs`
- `verify-invoice-phase1.mjs` – `phase5.mjs`
- `verify-primecare-production-golden-path.mjs`
- `verify-compensation-calculation.mjs`, `verify-cash-only-commission.mjs`, `verify-promotion-eligibility.mjs`, `verify-attribution-snapshots.mjs`, `verify-payroll-preview.mjs`, `verify-plan-versioning.mjs`
- `verify-payroll-locking.mjs`, `verify-payroll-immutability.mjs`, `verify-payroll-rbac.mjs`, `verify-payroll-audit.mjs`, `verify-payroll-export.mjs`, `verify-payroll-lifecycle.mjs`, `verify-payroll-adjustments.mjs`, `verify-payroll-versioning.mjs`
- `verify-compensation-no-finance-mutation.mjs`
- Phase 7.2 executive analytics (read-only): `verify-executive-reporting-context.mjs`, `verify-compensation-ratios.mjs`, `verify-compensation-rankings.mjs`, `verify-compensation-forecast.mjs`, `verify-compensation-territories.mjs`, `audit-phase-7-2-certification.mjs`
- **Executive ratio denominators (Phase 7.2):** Payroll / Cash Collected % uses `payments.amount_received` in the selected payroll period window (finance SoT). Payroll / Revenue Generated % uses period-scoped commercial revenue attribution from bounded AR + lab map reads — not lifetime AR totals. Both denominators share the same `periodYm` as the selected reporting context.
