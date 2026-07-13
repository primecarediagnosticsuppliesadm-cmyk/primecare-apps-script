# 02 — Field Dictionary

Critical fields across PrimeCare. For full column lists see [01_schema_catalog.md](./01_schema_catalog.md) and `primecare_public_schema.sql`.

**Convention:** Business keys are human-facing; UUID `id` columns are internal surrogates.

---

## Identity & tenancy

### `profiles.user_id`
- **Type:** uuid
- **Required:** yes
- **Meaning:** Links to `auth.users.id`
- **Written by:** Provisioning (`provisionPlatformUserWrite`)
- **Read by:** Auth context, all RLS helpers
- **Validation:** One profile per auth user

### `profiles.role`
- **Type:** text (CHECK constraint)
- **Required:** yes
- **Allowed:** `executive`, `admin`, `agent`, `lab`, `distributor_admin`, `distributor_manager`, `read_only_auditor`
- **Written by:** Operations Center provisioning
- **Read by:** `rolePermissionMatrix.js`, RLS `current_user_role()`
- **Rule:** Do not hardcode role checks in pages — use permission matrix

### `profiles.tenant_id`
- **Type:** uuid
- **Required:** yes (except executive cross-tenant patterns)
- **Meaning:** Home distributor workspace
- **Written by:** Provisioning
- **Read by:** All tenant-scoped queries; RLS `tenant_id_matches()`

### `profiles.lab_id`
- **Type:** text
- **Required:** for `lab` role
- **Meaning:** Lab identity for portal scope — normalized `upper(trim())`
- **Written by:** Provisioning
- **Read by:** Lab portal, RLS `current_profile_lab_id()`, order visibility
- **Validation:** Must match `labs.lab_id` for tenant

### `profiles.agent_id`
- **Type:** text
- **Required:** for `agent` role
- **Meaning:** Field agent code for visit/collection scope
- **Written by:** Provisioning / lab assignment
- **Read by:** Agent dashboard, collections filter, shipment assignment RLS

### `tenants.tenant_code`
- **Type:** text
- **Required:** yes
- **Unique:** yes
- **Meaning:** Stable distributor code (e.g. HQ workspace identifier)

---

## Labs & AR

### `labs.lab_id`
- **Type:** text
- **Required:** yes
- **Meaning:** Business lab identifier (e.g. `QA_LAB_001`)
- **Written by:** `createLabWrite`, distributor lab create RPC
- **Read by:** All lab-scoped modules
- **Normalization:** `labIdKey()` / `primecare_normalize_lab_id()` = `upper(trim())`
- **Downstream:** orders, AR, visits, qualifications, ownership

### `ar_credit_control.outstanding`
- **Type:** numeric
- **Required:** yes (default 0)
- **Meaning:** **Canonical lab outstanding for Collections UI**
- **Written by:** Fulfillment bump, `post_collection_payment` RPC, reconcile RPC
- **Read by:** Collections, Credit & Risk, Lab account, dashboards
- **Rule:** Do not derive outstanding from orders alone for headline AR

### `ar_credit_control.credit_hold`
- **Type:** boolean
- **Required:** yes (default false)
- **Meaning:** Blocks new lab orders when true
- **Written by:** HQ Credit & Risk
- **Read by:** `assertLabOrderCreditEligible`, Lab Ordering UI
- **Downstream:** `createOrderWrite` / `create_lab_order` RPC rejects with `credit_hold_active`

### `ar_credit_control.total_delivered` / `total_paid`
- **Type:** numeric
- **Meaning:** Cumulative delivered value and payments received
- **Written by:** Fulfillment and payment RPCs
- **Read by:** Collections KPIs, founder snapshot

---

## Orders

### `orders.id`
- **Type:** uuid
- **Required:** yes (auto)
- **Meaning:** Internal surrogate primary key
- **Read by:** Some admin joins; secondary lookup in `getOrderDetailsRead`
- **Rule:** **Never use as user-visible order number**

### `orders.order_id`
- **Type:** text
- **Required:** yes
- **Meaning:** **Business order number** (e.g. `ORD-1782870918027-jm4p3q`)
- **Written by:** `createOrderWrite` (client-generated or RPC)
- **Read by:** Orders, Lab Track Order, Invoices, Logistics, Payments, Ledger
- **Unique:** `(tenant_id, order_id)`
- **Validation:** Lab Track Order **must** search by `order_id` first, then `id` UUID
- **Downstream impact:** Wrong key breaks tracking, invoice link, shipment create

### `orders.lab_id`
- **Type:** text
- **Required:** yes
- **Meaning:** Ordering lab — drives RLS visibility
- **Written by:** Order create (lab user or HQ)
- **Read by:** All lab-scoped filters
- **Rule:** Must normalize before compare

### `orders.status`
- **Type:** text
- **Required:** yes
- **Allowed:** `Placed`, `Processing`, `Fulfilled`, `Cancelled` (UI/API enforced)
- **Written by:** `createOrderWrite`, `updateOrderStatusWrite`
- **Read by:** Dashboards, tracking, logistics eligibility
- **Rule:** Logistics status is separate — do not conflate with `dispatch_status`

### `orders.total_amount`
- **Type:** numeric(14,2)
- **Required:** yes
- **Meaning:** **Merchandise total only** in Phase 3A (excludes delivery charge)
- **Written by:** Order create from line sums
- **Read by:** Orders UI, AR bump on fulfill, invoices (subtotal source)
- **Rule:** Delivery charge stored in `delivery_charge_amount`, not added here until Phase 3B

### `orders.fulfilled_at`
- **Type:** timestamptz
- **Optional:** set on fulfill
- **Written by:** Fulfill path (`updateOrderStatusWrite`, fulfill-on-create)
- **Read by:** Analytics, EFI, logistics timing

### `orders.inventory_updated`
- **Type:** boolean
- **Meaning:** Idempotency flag — inventory deduction ran
- **Written by:** Fulfill path after `applyLabOrderInventoryDeduction`

### `orders.ar_posted`
- **Type:** boolean
- **Meaning:** Idempotency flag — AR outstanding bump ran
- **Written by:** Fulfill path after `bumpArOutstandingForFulfillment`

### `orders.invoice_id`
- **Type:** uuid
- **Optional:** set after invoice RPC
- **FK:** → `invoices.id`
- **Written by:** `create_invoice_for_fulfilled_order` RPC (via order update)
- **Read by:** Payment finalization, delivery override guard

### `orders.client_request_id`
- **Type:** text
- **Optional:** idempotency key from lab checkout (`CRQ-{lab}-{hash}`)
- **Unique:** partial per `(tenant_id, client_request_id)`
- **Written by:** Lab checkout
- **Rule:** Prevents duplicate order on double-submit

### `orders.delivery_charge_amount` (Phase 3A)
- **Type:** numeric
- **Default:** 0
- **Meaning:** Operational delivery quote — **not in AR/invoice yet**
- **Written by:** `persistOrderDeliverySnapshotWrite`, HQ override
- **Read by:** Logistics shipment mirror, Lab cart estimate
- **Migration:** `20260701120000_logistics_phase3a_delivery_charges.sql`

### `orders.merchandise_subtotal` (Phase 3A)
- **Type:** numeric
- **Meaning:** Sum of product lines at order time (excludes delivery)
- **Written by:** Delivery snapshot on order create

### `orders.delivery_method_intent` (Phase 3A)
- **Type:** text
- **Allowed:** `delivery`, `customer_pickup`, `unknown` (engine constants)
- **Meaning:** Operational intent for quote priority

---

## Order lines

### `order_items.order_id` / `order_lines.order_id`
- **Type:** text
- **Required:** yes
- **Meaning:** Join to `orders.order_id` (business key, not UUID)
- **Rule:** Line fetch tries both `order_items` and `order_lines` tables

### `order_lines.unit_selling_price` / `order_items.unit_price`
- **Type:** numeric
- **Meaning:** Unit price at order time — naming differs by table
- **Written by:** Order create RPC / legacy insert

### `order_lines.net_line_total` / `order_items.total_price`
- **Type:** numeric
- **Meaning:** Line extension (qty × unit)

---

## Invoices

### `invoices.invoice_number`
- **Type:** text
- **Required:** yes
- **Format:** `INV-YYYY-NNNNNN` (RPC allocated)
- **Unique:** per `(tenant_id, invoice_number)`
- **Read by:** Lab invoice center, PDF, collections

### `invoices.order_id`
- **Type:** text
- **Required:** yes
- **Meaning:** Business order key — links to `orders.order_id`
- **Unique:** one invoice per order per tenant

### `invoices.status`
- **Type:** text
- **Allowed:** `draft`, `sent`, `partially_paid`, `paid`, `cancelled`, `failed`
- **Written by:** Invoice RPC, allocation RPC, finalize/PDF flow
- **Read by:** `invoiceAccountStatus.js` — **allocation only when customer-facing**
- **Rule:** Draft without PDF/sent_at is not allocatable

### `invoices.pdf_storage_path`
- **Type:** text
- **Meaning:** Supabase storage path in `invoice-pdfs` bucket
- **Required for:** Customer-facing / allocatable invoice state

### `invoices.sent_at`
- **Type:** timestamptz
- **Meaning:** Invoice issued to customer — unlocks allocation path

---

## Payments & allocations

### `payments.payment_id`
- **Type:** text
- **Required:** yes
- **Meaning:** Business payment receipt id
- **Unique:** `(tenant_id, payment_id)`

### `payments.order_id`
- **Type:** text
- **Optional:** links collection to originating order
- **Meaning:** Triggers order-linked invoice finalize + auto-allocation
- **Rule:** **No `payments.invoice_id` column** — use allocations junction

### `payments.amount_received`
- **Type:** numeric
- **Required:** yes, must be > 0 on create
- **Written by:** `createPaymentWrite` / `post_collection_payment` RPC

### `invoice_payment_allocations.allocated_amount`
- **Type:** numeric
- **Required:** yes
- **Meaning:** Portion of payment applied to invoice
- **Written by:** `allocate_payment_to_invoice` RPC
- **Downstream:** Invoice open balance = total − Σ allocations

---

## Inventory

### `inventory.current_stock`
- **Type:** numeric
- **Constraint:** `>= 0`
- **Written by:** Order fulfill deduction, PO receive, ledger writes
- **Read by:** Lab catalog, order stock validation

### `inventory_ledger.movement_type`
- **Type:** text
- **Allowed examples:** `ORDER_OUT`, `PURCHASE_IN`, adjustments
- **Meaning:** Audit movement class
- **Rule:** Fulfilled order → ORDER_OUT per SKU (idempotent)

### `inventory_ledger.order_id`
- **Type:** text
- **Optional:** links movement to business order

---

## Logistics

### `order_shipments.shipment_id`
- **Type:** text
- **Pattern:** `SHP-{order_id}`
- **PK:** yes

### `order_shipments.dispatch_status`
- **Type:** text
- **Default:** `ready_for_dispatch`
- **Allowed:** see [06_logistics_delivery_rules.md](./06_logistics_delivery_rules.md)
- **Rule:** Independent from `orders.status`

### `order_shipments.delivered_at`
- **Type:** timestamptz
- **Meaning:** POD timestamp — **"delivered today" KPI uses this field**

### `order_shipments.delivery_charge_amount`
- **Type:** numeric
- **Meaning:** Operational mirror of order delivery quote — not AR

### `logistics_couriers.courier_id`
- **Type:** text
- **Meaning:** Courier directory key assigned to shipments

---

## Delivery policy

### `tenant_delivery_policy.standard_delivery_charge`
- **Default:** 150 (INR)
- **Written by:** HQ Delivery Policy panel

### `tenant_delivery_policy.free_delivery_threshold`
- **Default:** 5000 (INR)
- **Meaning:** Merchandise subtotal at or above → ₹0 delivery

---

## Agent & ownership

### `lab_ownership.primary_agent_id`
- **Type:** text
- **Meaning:** Canonical primary owner for collections visibility filter
- **Status:** `ACTIVE` | `INACTIVE` — only one ACTIVE per lab

### `agent_visits.visit_id`
- **Type:** text
- **Note:** No DB unique constraint — app should avoid duplicates

---

## Notification

### `notification_events.event_type`
- **Examples:** `order_created`, `order_fulfilled`, `payment_received`
- **Written by:** `fireNotificationEvent` from order/payment modules

---

## HQ read projections

Bounded selects defined in `src/api/hqReadBounds.js` — **use these constants**, not `select("*")`, in production-sensitive paths.

Key projection: `HQ_ORDER_LIST_COLUMNS` =  
`id, order_id, lab_id, status, order_date, created_at, total_amount, tenant_id, created_by, notes, agent_id, inventory_updated, fulfilled_at, invoice_id`

---

## Field anti-patterns (do not introduce)

| Anti-pattern | Why |
|--------------|-----|
| Using `orders.id` in lab Track Order UI | Users see `order_id` |
| Adding `payments.invoice_id` | Breaks junction allocation model |
| Putting delivery charge in `orders.total_amount` (Phase 3A) | Breaks invoice/AR reconciliation |
| `select("*")` on payments/orders at scale | Performance + column drift |
| Raw `lab_id` compare without normalization | RLS mismatches, cross-lab leaks |
