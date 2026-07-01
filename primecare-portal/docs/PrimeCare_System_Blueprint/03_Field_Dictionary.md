# 03 — Field Dictionary

Critical fields and **id vs business key** rules. Full table columns: `01_Database_Schema.md`.

---

## id vs business IDs (global rule)

| Pattern | Meaning | User-visible? | Example |
|---------|---------|---------------|---------|
| **`id` (uuid)** | Surrogate PK | **No** | `orders.id`, `invoices.id` |
| **Business text key** | Stable operational identifier | **Yes** | `order_id`, `payment_id`, `shipment_id` |
| **Business formatted key** | Human invoice number | **Yes** | `INV-2026-000049` |

**Rule:** User-facing flows (Track Order, support, banners) use **business keys**. UUID is secondary lookup only.

---

## orders.order_id

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Required** | yes |
| **Meaning** | Business order number |
| **Format** | `ORD-{timestamp}-{random}` typical |
| **Unique** | per `(tenant_id, order_id)` |
| **Written by** | `createOrderWrite`, `create_lab_order` RPC |
| **Read by** | Orders, Lab portal, Invoices, Logistics, Payments, Ledger |
| **Validation** | Lab Track Order **must** query this first |
| **Downstream** | Wrong key → tracking fails, invoice/shipment mismatch |
| **Do not** | Pass UUID when user supplied `order_id` |

---

## orders.id

| Attribute | Value |
|-----------|-------|
| **Type** | uuid |
| **Meaning** | Internal PK only |
| **Read by** | Secondary lookup in `getOrderDetailsRead` |
| **Do not** | Display in lab success banner as primary identifier |

---

## invoices.invoice_number

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Required** | yes |
| **Format** | `INV-YYYY-NNNNNN` |
| **Unique** | per `(tenant_id, invoice_number)` |
| **Written by** | `create_invoice_for_fulfilled_order` RPC |
| **Read by** | Lab invoices, PDF, collections |
| **Related** | `invoices.id` (uuid) for FKs; `invoices.order_id` links to business order |

---

## invoices.id / orders.invoice_id

| `invoices.id` | uuid PK |
| `orders.invoice_id` | uuid FK to invoices — set after invoice RPC |
| **Used by** | Payment finalize, delivery override guard |

---

## payments.payment_id

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Required** | yes |
| **Unique** | per `(tenant_id, payment_id)` |
| **Written by** | `createPaymentWrite` / `post_collection_payment` |
| **Read by** | Collections, allocations junction |
| **Not** | `payments.id` (uuid) for user display |

---

## order_shipments.shipment_id

| Attribute | Value |
|-----------|-------|
| **Type** | text (PK) |
| **Pattern** | `SHP-{order_id}` |
| **Written by** | `createShipmentForFulfilledOrderWrite` |
| **Meaning** | Operational shipment identifier |

---

## lab_id

| Attribute | Value |
|-----------|-------|
| **Type** | text on orders, labs, payments, profiles |
| **Normalization** | `upper(trim())` — `labIdKey()` / `primecare_normalize_lab_id()` |
| **Written by** | Lab create, order create, provisioning |
| **Read by** | All lab-scoped RLS and UI filters |
| **Rule** | Compare normalized keys only |

---

## tenant_id

| Attribute | Value |
|-----------|-------|
| **Type** | uuid (canonical); text in some legacy rows |
| **Meaning** | Distributor workspace scope |
| **Written by** | All tenant-scoped inserts |
| **Read by** | RLS `tenant_id_matches()`, every bounded read |
| **Rule** | Cross-tenant access only for executive role patterns |

---

## agent_id

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **On** | profiles, orders, payments, visits, ownership |
| **Normalization** | `normalizeAgentIdKey()` |
| **Meaning** | Field agent code for visits/collections/shipment assignment |

---

## payment_status (AR / collections)

| Context | Field | Meaning |
|---------|-------|---------|
| AR row | `ar_credit_control.payment_status` | Collections summary label |
| Invoice | `invoices.status` | draft/sent/partially_paid/paid — **canonical with allocations** |
| Order tracking UI | derived | `formatOrderPaymentLabel()` — not a single DB column on orders |

**Rule:** Invoice allocation is canonical for invoice paid state; AR outstanding is canonical for collections headline.

---

## dispatch_status (order_shipments)

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Default** | `ready_for_dispatch` |
| **Allowed** | ready_for_dispatch, assigned, out_for_delivery, delivered, delivery_failed, rescheduled, returned |
| **Meaning** | **Operational** delivery state — independent of `orders.status` |
| **KPI** | "Delivered today" uses `delivered_at`, not this field alone |

---

## delivery_charge_amount

| Attribute | Value |
|-----------|-------|
| **On** | `orders`, `order_shipments` |
| **Type** | numeric |
| **Default** | 0 |
| **Phase** | 3A operational quote only |
| **Not in** | `orders.total_amount`, invoices, AR (until Phase 3B) |
| **Written by** | `persistOrderDeliverySnapshotWrite`, shipment create mirror |

---

## delivery_charge_reason

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Values** | `hq_override`, `customer_pickup`, `l1b_contract`, `free_threshold`, `standard` |
| **Source** | `deliveryChargeEngine.js` |
| **Meaning** | Audit trail for quote priority outcome |

---

## delivery_method_intent

| Attribute | Value |
|-----------|-------|
| **On** | orders |
| **Values** | `delivery`, `customer_pickup`, `unknown` |
| **Meaning** | Operational intent at order time |
| **Effect** | pickup → ₹0 delivery in quote engine |

---

## delivery_charge_status

| Attribute | Value |
|-----------|-------|
| **On** | orders |
| **Values** | `quoted`, `waived`, `finalized` |
| **Meaning** | Operational lifecycle of quote (not invoice status) |

---

## HQ read projections

Use `HQ_ORDER_LIST_COLUMNS` and siblings in `hqReadBounds.js` — never `select("*")` on payments/orders in production paths.

```text
HQ_ORDER_LIST_COLUMNS =
  id, order_id, lab_id, status, order_date, created_at, total_amount,
  tenant_id, created_by, notes, agent_id, inventory_updated, fulfilled_at, invoice_id
```

---

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Track order by UUID only | `order_id` first |
| Add delivery to total_amount (3A) | `delivery_charge_amount` |
| Use payments.invoice_id | allocations junction |
| Raw lab_id compare | `labIdKey()` |
