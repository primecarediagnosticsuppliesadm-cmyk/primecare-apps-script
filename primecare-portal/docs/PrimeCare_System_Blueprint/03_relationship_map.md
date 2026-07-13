# 03 — Relationship Map

Parent → child relationships, join fields, business rules, and common query patterns.

---

## Tenancy spine

```
tenants (id)
  ├── profiles (tenant_id)
  ├── labs (tenant_id, lab_id)
  ├── ar_credit_control (tenant_id, lab_id)
  ├── orders (tenant_id, order_id, lab_id)
  ├── inventory (tenant_id, product_id)
  ├── invoices (tenant_id)
  ├── payments (tenant_id)
  ├── order_shipments (tenant_id)
  ├── tenant_delivery_policy (tenant_id)
  └── lab_ownership (tenant_id, lab_id)
```

---

## Lab domain

### labs → orders
| Attribute | Detail |
|-----------|--------|
| **Parent** | `labs` |
| **Child** | `orders` |
| **Join** | `orders.tenant_id = labs.tenant_id` AND `primecare_normalize_lab_id(orders.lab_id) = primecare_normalize_lab_id(labs.lab_id)` |
| **Cardinality** | 1 lab : N orders |
| **Business rule** | Lab user sees only orders where `lab_id` matches profile |
| **Query pattern** | `getLabRecentOrdersRead(labId)` → `.eq("lab_id", lid).order("created_at", desc).limit(50)` |

### labs → ar_credit_control
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, lab_id)` |
| **Cardinality** | 1:1 per lab |
| **Business rule** | Created with lab; outstanding is collections SoT |
| **Query pattern** | `v_labs_credit` view join for Labs page + Collections |

### labs → lab_ownership
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, lab_id)` |
| **Cardinality** | 0..1 ACTIVE ownership row |
| **Business rule** | Agent collections filtered by ownership when rows exist |
| **Query pattern** | `getLabOwnershipRead` → agent workspace filter |

### labs → lab_qualifications
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, lab_id)` unique |
| **Cardinality** | 1:1 |
| **Business rule** | Pipeline stage drives executive action queue |

### labs → agent_visits
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, lab_id)` |
| **Cardinality** | 1:N visits |
| **Query pattern** | Agent dashboard bounded by `agent_id` + lab visibility |

---

## Order domain

### orders → order_items
| Attribute | Detail |
|-----------|--------|
| **Join** | `order_items.order_id = orders.order_id` (text) |
| **Cardinality** | 1:N |
| **Business rule** | Lab portal write path inserts here; fulfillment may read |
| **Query pattern** | `fetchOrderDetailLinesForOrder` tries items after lines |

### orders → order_lines
| Attribute | Detail |
|-----------|--------|
| **Join** | `order_lines.order_id = orders.order_id` AND `order_lines.tenant_id = orders.tenant_id` |
| **Cardinality** | 1:N |
| **Business rule** | Invoice RPC and metrics prefer this table |
| **Query pattern** | Invoice line snapshot from order_lines at fulfill |

### orders → invoices
| Attribute | Detail |
|-----------|--------|
| **Join** | `invoices.order_id = orders.order_id` AND same `tenant_id`; back-link `orders.invoice_id = invoices.id` |
| **Cardinality** | 1:1 (enforced unique on tenant+order_id) |
| **Business rule** | Created idempotently on fulfill via RPC only |
| **Query pattern** | `getOrderInvoiceForDeliveryOverrideRead`; payment `resolveOrderInvoiceForPayment` |

### orders → order_shipments
| Attribute | Detail |
|-----------|--------|
| **Join** | `order_shipments.order_id = orders.order_id` AND same `tenant_id` |
| **Cardinality** | 1:1 (unique constraint) |
| **Business rule** | Auto-created after fulfill; non-blocking; operational only |
| **Query pattern** | `createShipmentForFulfilledOrderWrite` idempotent lookup |

### orders → payments (logical)
| Attribute | Detail |
|-----------|--------|
| **Join** | `payments.order_id = orders.order_id` (optional on payment) |
| **Cardinality** | 1 order : 0..N payments |
| **Business rule** | Order-linked payment triggers invoice finalize + auto-allocation |
| **Query pattern** | Collections open orders + payment drawer |

### orders → inventory_ledger
| Attribute | Detail |
|-----------|--------|
| **Join** | `inventory_ledger.order_id = orders.order_id` |
| **Cardinality** | 1 order : N ledger rows (per SKU) |
| **Business rule** | ORDER_OUT on fulfill; idempotent per order+product |
| **Query pattern** | Orders admin certification checks ledger on fulfill |

---

## Invoice & payment domain

### invoices → invoice_line_items
| Attribute | Detail |
|-----------|--------|
| **Join** | `invoice_line_items.invoice_id = invoices.id` |
| **Cardinality** | 1:N |
| **Business rule** | Immutable snapshot; PDF reads only this table |
| **Query pattern** | `getInvoiceDetailRead` |

### invoices → invoice_payment_allocations
| Attribute | Detail |
|-----------|--------|
| **Join** | `invoice_payment_allocations.invoice_id = invoices.id` |
| **Cardinality** | 1:N allocations |
| **Business rule** | **Canonical** for invoice open balance and paid/partial status |
| **Query pattern** | `getInvoiceAllocationsRead`; `openBalance = total − Σ allocated` |

### payments → invoice_payment_allocations
| Attribute | Detail |
|-----------|--------|
| **Join** | `invoice_payment_allocations.payment_id = payments.payment_id` (text) |
| **Cardinality** | 1 payment : 0..N invoice allocations |
| **Business rule** | No direct payment→invoice FK column |
| **Query pattern** | `allocate_payment_to_invoice` RPC |

### payments → ar_credit_control (effect)
| Attribute | Detail |
|-----------|--------|
| **Join** | via `(tenant_id, lab_id)` on payment post |
| **Business rule** | `post_collection_payment` decrements outstanding |
| **Query pattern** | Financial reconciliation script compares payments vs AR |

---

## Logistics domain

### order_shipments → shipment_status_events
| Attribute | Detail |
|-----------|--------|
| **Join** | `shipment_status_events.shipment_id = order_shipments.shipment_id` |
| **FK** | ON DELETE CASCADE |
| **Cardinality** | 1:N events |
| **Business rule** | Every status transition appends audit row |
| **Query pattern** | `getShipmentEventsRead` ordered by `created_at` |

### logistics_couriers → order_shipments (logical)
| Attribute | Detail |
|-----------|--------|
| **Join** | `order_shipments.courier_id = logistics_couriers.courier_id` |
| **Cardinality** | 1 courier : N shipments |
| **Note** | No formal FK — text reference |

### orders → order_shipments (delivery charge mirror)
| Attribute | Detail |
|-----------|--------|
| **Fields** | `delivery_charge_amount`, `delivery_charge_reason` copied at create |
| **Business rule** | HQ override syncs via `syncShipmentDeliveryMirrorWrite` |

---

## Inventory & procurement

### inventory → inventory_ledger
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, product_id)` |
| **Cardinality** | 1 inventory row : N ledger movements |
| **Business rule** | Ledger is audit; `current_stock` is operational snapshot |

### purchase_orders → purchase_order_items
| Attribute | Detail |
|-----------|--------|
| **Join** | `po_id` |
| **Cardinality** | 1:N |
| **Business rule** | Receive updates inventory + PURCHASE_IN ledger |

### products → inventory
| Attribute | Detail |
|-----------|--------|
| **Join** | `(tenant_id, product_id)` |
| **Business rule** | Catalog create still seeds inventory (deferred redesign) |

---

## Agent ownership

### agent (profiles.agent_id) → owned labs
| Attribute | Detail |
|-----------|--------|
| **Via** | `lab_ownership.primary_agent_id` OR `labs.assigned_agent_id` |
| **Business rule** | Collections agent filter uses ownership when configured |
| **Query pattern** | `verify-agent-collections-ownership-filter.mjs` |

### lab_ownership → user_provisioning_events
| Attribute | Detail |
|-----------|--------|
| **Business rule** | Ownership changes audited in provisioning events |

---

## Auth bridge

### auth.users → profiles
| Attribute | Detail |
|-----------|--------|
| **Join** | `profiles.user_id = auth.users.id` |
| **Cardinality** | 1:1 |
| **Business rule** | All RLS helpers read JWT → profile row |

---

## Common cross-module query patterns

| Use case | Pattern |
|----------|---------|
| Lab recent orders | `orders` WHERE `lab_id` = profile lab, bounded columns, RLS |
| Order detail + lines | Resolve by `order_id` then `id`; fetch lines from `order_lines` then `order_items` |
| Lab track order | `getLabOrderDetailsRead({ orderId, labId, tenantId })` |
| HQ order list | `getOrdersRead` with `HQ_ORDER_LIST_COLUMNS`, tenant RLS |
| Collections lab row | `v_labs_credit` or `ar_credit_control` + payments bounded |
| Invoice open balance | invoice total − SUM(allocations) WHERE invoice customer-facing |
| Logistics board | `order_shipments` WHERE tenant, order by `created_at` desc |
| Fulfill side effects | order update → inventory RPC → AR bump → invoice RPC → shipment create |

---

## Relationship integrity notes

- **Text joins** (`order_id`, `payment_id`) rely on RPC/trigger discipline — not all have DB FKs.
- **Dual line tables** — always try both `order_lines` and `order_items` in detail reads.
- **UUID vs business key** — invoices link to orders by `order_id` text; `orders.invoice_id` is uuid FK to invoice row.
