# 05 — Order, Invoice & Payment Rules

Strict finance lifecycle for PrimeCare Year-1 pilot.  
**Orders = financial SoT.** Invoices and allocations define customer billing state. AR is canonical for collections.

---

## Lifecycle overview

```
Lab checkout (Placed)
    → HQ Processing (optional)
    → Fulfilled
        → Inventory deduction (ORDER_OUT, idempotent)
        → AR outstanding bump (idempotent)
        → Invoice RPC (idempotent)
        → Shipment create (operational, non-blocking)
    → Payment received
        → Finalize invoice (draft → PDF → sent)
        → Allocate to invoice (junction table)
        → AR outstanding reduced
```

---

## 1. Order creation

| Rule | Detail |
|------|--------|
| **Entry** | Lab `createOrderWrite` or HQ order create |
| **Default status** | `Placed` |
| **Credit check** | `assertLabOrderCreditEligible` — blocks if `credit_hold` |
| **Stock check** | No backorder in pilot — qty ≤ `inventory.current_stock` |
| **Idempotency** | `client_request_id` per checkout hash → RPC returns existing order |
| **RPC preferred** | `create_lab_order` atomic order + lines |
| **Delivery snapshot** | Phase 3A: `persistOrderDeliverySnapshotWrite` on create |
| **total_amount** | Merchandise lines only — **excludes delivery charge** (Phase 3A) |
| **AR / invoice** | **No** AR or invoice at order create |

### Allowed statuses
`Placed` → `Processing` → `Fulfilled` → `Cancelled`

| Transition | Allowed |
|------------|---------|
| Cancelled → Fulfilled | **No** |
| Fulfilled → Placed | **No** |

---

## 2. Fulfillment

Triggered by `updateOrderStatusWrite` (HQ) or `createOrderWrite` with status Fulfilled.

| Step | Function / RPC | Idempotent |
|------|----------------|------------|
| Inventory deduct | `applyLabOrderInventoryDeduction` / `deduct_inventory_for_order` | Yes (`inventory_updated`, ledger check) |
| AR bump | `bumpArOutstandingForFulfillment` | Yes (`ar_posted`) |
| Order flags | `fulfilled_at`, `inventory_updated`, `ar_posted` | — |
| Invoice | `create_invoice_for_fulfilled_order` RPC | Yes |
| Shipment | `tryCreateShipmentAfterFulfill` | Yes (separate doc) |

**Failure policy:** Invoice and shipment failures **do not roll back** fulfill. Errors logged via `hqDebugWarn` only.

---

## 3. Inventory deduction

- Movement type: `ORDER_OUT`
- One ledger row per product SKU per order (certification requirement)
- Cancelled orders: **no** ORDER_OUT (except documented seed `QA_ORD_001`)
- Stock constraint: `current_stock >= 0` enforced at DB level

---

## 4. Invoice creation

| Rule | Detail |
|------|--------|
| **Trigger** | Order becomes `Fulfilled` |
| **RPC** | `create_invoice_for_fulfilled_order` |
| **Cardinality** | One invoice per `(tenant_id, order_id)` |
| **Number format** | `INV-YYYY-NNNNNN` via sequence RPC |
| **Line source** | Snapshot from `order_lines` → `invoice_line_items` |
| **Initial status** | `draft` |
| **Back-link** | `orders.invoice_id` set to invoice uuid |
| **created_source** | Passed from caller (`updateOrderStatusWrite`, `createOrderWrite`) |

---

## 5. PDF / send lifecycle

| Stage | Requirements |
|-------|----------------|
| **draft** | Invoice exists; not customer-facing |
| **Customer-facing** | `pdf_storage_path` + (`sent_at` OR `pdf_generated_at`) |
| **Finalize** | `finalizeInvoiceForOrderPayment` before allocation on order-linked payments |
| **PDF source** | Edge function reads **`invoice_line_items` only** — not live catalog |
| **Storage** | `invoice-pdfs` bucket |

**Allocatability rule** (`invoiceAccountStatus.js`): Payment allocation allowed only when invoice is customer-facing (`sent` or `partially_paid` with PDF/sent), not `cancelled`/`failed`/fully `paid`.

---

## 6. Payment creation

| Rule | Detail |
|------|--------|
| **Entry** | `createPaymentWrite` (Collections / Credit & Risk) |
| **Validation** | `lab_id` required; `amount_received > 0` |
| **RPC preferred** | `post_collection_payment` |
| **AR update** | Outstanding reduced on successful post |
| **Order link** | Optional `order_id` triggers invoice finalize + auto-allocation |

---

## 7. Invoice allocation

| Rule | Detail |
|------|--------|
| **Canonical table** | `invoice_payment_allocations` only |
| **Forbidden** | `payments.invoice_id` column — must not exist or be used |
| **RPC** | `allocate_payment_to_invoice` |
| **Amount** | `min(payment_amount, invoice_open_balance)` |
| **Status effect** | `partially_paid` when 0 < allocated < total; `paid` when fully allocated |
| **Idempotency** | RPC guards duplicate/over-allocation |

### Open balance formula
```
openBalance = invoice.total_amount − SUM(invoice_payment_allocations.allocated_amount)
```

---

## 8. Partial payment

- Invoice moves to `partially_paid` when partially allocated
- Open balance visible consistently across Lab Account, Collections, Invoice Center
- `verify-partial-payment-sync.mjs` enforces strict lifecycle — **no draft allocation relaxation**

---

## 9. Final payment

- Full allocation → invoice `paid`
- AR outstanding reflects cumulative payments via `post_collection_payment`
- Lab account ledger combines invoices + payments + AR row

---

## 10. Collections sync

| Source | Use |
|--------|-----|
| **AR (`ar_credit_control.outstanding`)** | Headline collections KPI, credit risk |
| **Invoice allocations** | Per-invoice open balance, payment status labels |
| **Open fulfilled orders** | `collectionsOpenOrders.js` — orders with pending payment |
| **Unallocated AR** | outstanding − sum(open order totals) where applicable |

Reconcile RPC: `reconcile_ar_from_payments` (service role) for drift repair.

---

## Do-not-break rules (finance)

| # | Rule |
|---|------|
| 1 | **Commission/payroll must not change payment logic** — `commission_entries` is separate module |
| 2 | **Delivery charges operational only** until `LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED` / Phase 3B |
| 3 | **Invoice allocation is canonical** for invoice paid/partial status — not payment row alone |
| 4 | **AR is canonical** for collections headline outstanding |
| 5 | **No draft invoice allocation** unless explicit lifecycle policy change approved |
| 6 | **Finalize PDF before allocate** on order-linked payments |
| 7 | **Fulfill does not roll back** on invoice/shipment failure |
| 8 | **Payment write compensates** on AR failure for new payments (`compensateFailedOrderPaymentWrite`) |
| 9 | **Bounded reads** on payments/invoices — use `hqReadBounds.js` projections |
| 10 | **Guntur certified tenant** must not be mutated by test scripts |

---

## Payment status labels (lab tracking)

- `formatOrderPaymentLabel` — cancelled order + pending payment → "Payment Pending — Order Cancelled"
- Internal draft invoices excluded from lab open-invoice widgets

---

## Key API map

| Operation | Primary API |
|-----------|-------------|
| Create order | `createOrderWrite` / `create_lab_order` |
| Fulfill | `updateOrderStatusWrite` |
| Create invoice | `createInvoiceForFulfilledOrderWrite` → RPC |
| Record payment | `createPaymentWrite` → `post_collection_payment` |
| Allocate | `allocatePaymentToInvoiceWrite` → RPC |
| Finalize invoice | `finalizeInvoiceForOrderPayment` |
| Lab ledger | `buildLabAccountLedger` |

---

## Verification scripts

- `verify-financial-reconciliation.mjs`
- `verify-partial-payment-sync.mjs`
- `verify-invoice-phase1.mjs` through `phase5.mjs`
- `verify-order-payment-sync.mjs`
- `verify-primecare-production-golden-path.mjs`
