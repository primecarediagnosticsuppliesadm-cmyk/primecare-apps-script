# 02 — Object Relationships

Parent → child joins, business rules, and common PostgREST patterns.

---

## Tenancy spine

```
tenants
  ├── profiles
  ├── labs ── ar_credit_control (1:1)
  │     ├── orders
  │     │     ├── order_items | order_lines
  │     │     ├── invoices (1:1)
  │     │     ├── order_shipments (1:1)
  │     │     └── inventory_ledger (ORDER_OUT)
  │     ├── payments ── invoice_payment_allocations
  │     ├── lab_ownership
  │     ├── lab_qualifications
  │     └── agent_visits
  ├── inventory ── inventory_ledger
  ├── purchase_orders ── purchase_order_items
  └── agent_resources
        ├── agent_resource_versions
        ├── agent_resource_audiences
        └── agent_resource_acknowledgements
  └── tenant_delivery_policy
  └── logistics_warehouses
        └── delivery_routes
              └── delivery_route_shipments → order_shipments
  └── payroll_periods
        └── payroll_runs
              └── payroll_run_lines
                    ├── compensation_commission_entries (cash collected)
                    └── compensation_adjustments
```

---

## Logistics planning graph (Phase 4)

```
logistics_warehouses
  └── delivery_routes (warehouse_id, courier_id → logistics_couriers)
        └── delivery_route_shipments (sequence_number)
              └── order_shipments (shipment_id)
                    └── logistics_couriers (courier_id on shipment assignment)
```

---

## Relationship table

| Parent | Child | Join field | Cardinality | Business rule |
|--------|-------|------------|-------------|---------------|
| labs | orders | tenant_id + lab_id | 1:N | Lab sees own orders only |
| orders | order_lines | order_id (+ tenant_id) | 1:N | Invoice snapshot source |
| orders | order_items | order_id | 1:N | Portal write path |
| orders | invoices | order_id; orders.invoice_id → invoices.id | 1:1 | Created on fulfill RPC |
| invoices | invoice_line_items | invoice_id | 1:N | Immutable at invoice time |
| invoices | invoice_payment_allocations | invoice_id | 1:N | Canonical open balance |
| payments | invoice_payment_allocations | payment_id (text) | 1:N | No payments.invoice_id |
| payments | ar_credit_control | tenant_id + lab_id | effect | Outstanding reduced on post |
| orders | order_shipments | order_id + tenant_id | 1:1 | After fulfill; ops only |
| order_shipments | shipment_status_events | shipment_id | 1:N | Audit every transition |
| logistics_couriers | order_shipments | courier_id (text) | 1:N | No formal FK |
| logistics_warehouses | delivery_routes | warehouse_id | 1:N | Route origin warehouse |
| delivery_routes | delivery_route_shipments | route_id | 1:N | Stop sequencing |
| order_shipments | delivery_route_shipments | shipment_id | 1:1 | One route per shipment |
| delivery_routes | logistics_couriers | courier_id (text) | N:1 | Driver assignment on route |
| labs | delivery planning | preferred_delivery_day | attr | Groups unassigned shipments |
| labs | lab_ownership | tenant_id + lab_id | 0..1 ACTIVE | Agent collections filter |
| payments | compensation_commission_entries | payment_id snapshot/ref | derived | Cash-only commission input; no payment mutation |
| lab_ownership | compensation_commission_entries | tenant_id + lab_id + payment date snapshot | derived | Fallback attribution when payments.agent_id is absent |
| payroll_periods | payroll_runs | period_id | 1:N | Preview/versioned payroll runs |
| payroll_runs | payroll_run_lines | payroll_run_id | 1:N | Agent-level payable lines |
| inventory | inventory_ledger | tenant_id + product_id | 1:N | Ledger = audit |
| purchase_orders | purchase_order_items | po_id | 1:N | Receive → stock |
| tenants | agent_resources | tenant_id | 1:N | Field library |
| agent_resources | agent_resource_versions | resource_id + tenant_id | 1:N | At most one `published` |
| agent_resources | agent_resource_audiences | resource_id + tenant_id | 1:N | Named agents only |
| agent_resources | agent_resource_acknowledgements | resource_id + tenant_id | 1:N | Ack per version |
| agent_resource_versions | agent_resource_acknowledgements | version_id + resource_id + tenant_id | 1:N | Historical acks stay on old versions |
| profiles | agent_resource_audiences | profile_user_id = user_id | 1:N | Canonical audience identity |
| profiles | agent_resource_acknowledgements | profile_user_id = user_id | 1:N | Self-ack only |

---

## orders ↔ invoices

```
invoices.order_id = orders.order_id  (business text)
orders.invoice_id = invoices.id      (uuid back-link)
UNIQUE (tenant_id, order_id) on invoices
```

**Query:** `resolveOrderInvoiceForPayment(order_id)` → finalize → allocate.

---

## orders ↔ shipments

```
order_shipments.order_id = orders.order_id
UNIQUE (tenant_id, order_id)
shipment_id = 'SHP-' || order_id
```

**Rule:** Financial status on order; dispatch status on shipment — never conflate.

---

## Dual line model

Detail reads (`fetchOrderDetailLinesForOrder`):

1. Try `order_lines` by order_id (and uuid fallback)
2. Fall back to `order_items`

Always document which path a new feature uses.

---

## Agent ownership graph

```
profiles.agent_id
  → lab_ownership.primary_agent_id (ACTIVE)
  → labs.assigned_agent_id (legacy sync)
```

Collections agent filter: ownership rows when present.

Compensation attribution:

1. Use `payments.agent_id` when populated and certified.
2. Otherwise use active `lab_ownership` at the payment date.
3. Persist attribution snapshot, method, source payment references/hash, and rule version before approval/lock.
4. Never recompute locked payroll from current ownership.

---

## Common query patterns

| Use case | Pattern |
|----------|---------|
| Lab recent orders | `.eq('lab_id', lid).order('created_at', {ascending:false}).limit(50)` |
| Order detail | `.eq('order_id', oid)` then `.eq('id', oid)` |
| Lab track order | `getLabOrderDetailsRead({ orderId, labId, tenantId })` |
| Invoice open balance | `total - sum(allocations)` |
| Logistics board | `order_shipments` by tenant, order created_at desc |
| Collections AR | `v_labs_credit` or `ar_credit_control` bounded |
| Payroll commission | Bounded payments read + attribution snapshot; cash collected only |

---

## Integrity notes

- Text joins (`order_id`, `payment_id`) — RPC-enforced; not all DB FKs
- `tenant_id` may be uuid (canonical) or text in legacy rows — normalize in RPCs
- Phase 3A columns may be missing if migration not applied — see CHANGELOG
- Compensation/payroll is derived from payments and ownership snapshots only; it must not mutate O2C source records or create accounting entries in Phase 1/2.
