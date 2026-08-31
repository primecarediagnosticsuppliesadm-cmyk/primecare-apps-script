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

## order/audit source metadata

| Attribute | Value |
|-----------|-------|
| **Meaning** | Identifies the initiating workflow for order creation and audit review |
| **Required value** | Admin on-behalf ordering must record `source = admin_on_behalf` in order/audit metadata |
| **Customer** | Selected lab remains the order customer (`tenant_id`, `lab_id`) |
| **Actor** | Authenticated HQ `admin` / `executive` remains the actor; do not impersonate a lab user |
| **Context captured** | Originating screen, selected customer lab, authenticated HQ actor, lifecycle status, and ordering mode at submit time |
| **Must not affect** | Pricing, catalog, credit, inventory, finance, delivery, AR, shipment, commission, or order lifecycle behavior |

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

## labs.status

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Meaning** | Lab lifecycle/account status |
| **Values** | `PROSPECT`, `ACTIVE`, `INACTIVE` |
| **KPI** | `Total Labs` counts all visible labs; `Prospect Labs`, `Active Labs`, and `Inactive Labs` count `labs.status == PROSPECT`, `ACTIVE`, and `INACTIVE` respectively |
| **Written by** | `createLabWrite` for new labs; `updateLabLifecycleStatusWrite` for lifecycle transitions |
| **Transition roles** | `admin`, `executive` only |
| **Transition controls** | Confirmation required; reason required for `PROSPECT -> INACTIVE`, `ACTIVE -> INACTIVE`, and `INACTIVE -> ACTIVE` |
| **INACTIVE rule** | `ACTIVE -> INACTIVE` must force `labs.ordering_mode = suspended`; `INACTIVE -> ACTIVE` does not restore prior ordering mode |
| **Not affected by** | `labs.ordering_mode`; checkout suspension does not change lifecycle-active status |
| **Must not affect** | AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting history, or authorized HQ visibility |

---

## labs.ordering_mode

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Values** | `hq_managed`, `hybrid`, `self_service`, `suspended` |
| **Meaning** | Runtime order-initiation governance for lab callers |
| **KPI** | `Ordering Suspended` counts rows where `ordering_mode == suspended`; `Order-Eligible Labs` also requires `ordering_eligible == true` |
| **Lifecycle interaction** | `ACTIVE -> INACTIVE` forces `suspended`; `INACTIVE -> ACTIVE` leaves `ordering_mode` unchanged until admin explicitly selects HQ Managed, Hybrid, or Self Service |
| **Admin on-behalf ordering** | `admin` / `executive` may create orders on behalf of `ACTIVE` labs when mode is `hq_managed`, `hybrid`, or `self_service`; blocked when `labs.status = INACTIVE` or mode is `suspended` |
| **Does not affect** | Invoices, payments, Track Order, finance, logistics, history, or `Active Labs` lifecycle status |

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
| **Compensation attribution** | `payments.agent_id` is the preferred future payroll attribution source when populated and certified; otherwise use an audited `lab_ownership` snapshot at payment date |

---

## hr role

| Attribute | Value |
|-----------|-------|
| **Type** | role slug (planned) |
| **Meaning** | HQ payroll support role |
| **Allowed** | Maintain salary/payroll data, generate payroll previews, submit previews for Executive review |
| **Blocked** | Approve payouts, approve commission changes, lock payroll runs, authorize exports, create accounting entries |
| **Implementation gate** | Requires `profiles.role`, provisioning, `rolePermissionMatrix.js`, menus, and RLS review before app/schema implementation |

---

## attributable_cash_collected

| Attribute | Value |
|-----------|-------|
| **Type** | numeric |
| **Meaning** | Cash actually collected and attributable to an agent for payroll commission |
| **Source** | `payments.amount_received` after successful payment write and AR reduction |
| **Attribution** | `payments.agent_id` if available; otherwise `lab_ownership` snapshot at payment date |
| **Must not use** | Order value, invoice value, fulfilled revenue, projected revenue, outstanding receivables, or allocation totals as commission amount |

---

## compensation_commission_rate_bps

| Attribute | Value |
|-----------|-------|
| **Type** | integer basis points |
| **Baseline** | 300 bps (3%) for Year-1 baseline |
| **Promoted** | 350 bps (3.5%) after promotion eligibility |
| **Rule** | Applied only to `attributable_cash_collected` |

---

## payroll_period.period_ym

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Format** | `YYYY-MM` |
| **Meaning** | Monthly compensation period |
| **Lifecycle** | open → previewed → submitted → approved → locked → exported; rejected/void as exception states |

---

## payroll_run.status

| Attribute | Value |
|-----------|-------|
| **Type** | text |
| **Values** | draft, previewed, submitted, approved, locked, exported, rejected, void |
| **Owner** | Executive owns approve/lock/export; HR can preview/submit |
| **Immutable point** | Locked runs cannot be edited except Executive void/reversal workflow |

---

## compensation_attribution_snapshot

| Attribute | Value |
|-----------|-------|
| **Meaning** | Auditable record of how a payment was attributed to an agent for compensation |
| **Required fields** | Payment refs/hash, agent ID/name, attribution method, lab ID, ownership source, payment date, rule version |
| **Rule** | Locked payroll must read the persisted snapshot, not current ownership |

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

## Agent Resources identity and versions

| Field | Meaning |
|-------|---------|
| `agent_resources.id` | Logical document UUID (not user-visible) |
| `agent_resource_versions.version_number` | Integer ≥ 1; unique per resource |
| `current_published_version_id` | Pointer to the single published version; **RPC-only** |
| `audience_type` | `all_agents` or `named_agents` |
| `agent_resource_audiences.profile_user_id` | `profiles.user_id` = `auth.uid()` |
| `agent_resource_versions.storage_path` | `{tenant_id}/{resource_id}/{version_id}/{random}` — never original filename |
| `agent_resource_acknowledgements` | Unique `(tenant_id, version_id, profile_user_id)` |

See [25_Agent_Resources.md](./25_Agent_Resources.md).

---

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Track order by UUID only | `order_id` first |
| Add delivery to total_amount (3A) | `delivery_charge_amount` |
| Use payments.invoice_id | allocations junction |
| Raw lab_id compare | `labIdKey()` |
| Store field playbooks in `operational-evidence` or `invoice-pdfs` | `agent-resources` + `agent_resources` |
| Key Agent Resource audience on `agent_id` | `profiles.user_id` / `auth.uid()` |
| Treat notification read as document acknowledgement | `agent_resource_acknowledgements` |
