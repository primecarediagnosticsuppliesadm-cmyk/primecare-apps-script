# 06 — Logistics & Delivery Rules

Operational delivery layer. **Shipments are not the financial SoT** — orders and invoices own revenue lifecycle.

---

## Architecture principle

| Domain | Source of truth |
|--------|-----------------|
| Order financial status | `orders.status` |
| Invoice / AR | `invoices`, `ar_credit_control`, allocations |
| Dispatch / delivery ops | `order_shipments`, `shipment_status_events` |
| Delivery charge (Phase 3A) | Operational quote on `orders` + mirror on `order_shipments` |

**Logistics does not own revenue until Phase 3B** (invoice/AR integration — not enabled).

---

## Shipment creation

| Rule | Detail |
|------|--------|
| **Trigger** | After order becomes `Fulfilled` |
| **Hook** | `tryCreateShipmentAfterFulfill` in fulfill paths |
| **Order** | Runs **after** `createInvoiceForFulfilledOrderWrite` |
| **API** | `createShipmentForFulfilledOrderWrite` |
| **Idempotency** | Unique `(tenant_id, order_id)` — skip if exists |
| **Shipment ID** | `SHP-{order_id}` |
| **Initial status** | `ready_for_dispatch` |
| **Failure** | Non-blocking — logged only; fulfill not rolled back |
| **Finance impact** | **None** in Phase 3A |

### Fulfill paths that call shipment hook
- `updateOrderStatusWrite` (HQ Orders Monitor)
- `createOrderWrite` RPC path (fulfill-on-submit)
- `createOrderWrite` legacy path (fulfill-on-submit)

---

## One shipment per order

- DB constraint: `UNIQUE (tenant_id, order_id)` on `order_shipments`
- Race handling: duplicate insert `23505` → re-fetch existing row

---

## Shipment status lifecycle

```
ready_for_dispatch
    → assigned
    → out_for_delivery
    → delivered | delivery_failed
delivery_failed → rescheduled | returned
rescheduled → assigned | out_for_delivery | delivered
delivered → (terminal)
returned → (terminal)
```

**Engine:** `logisticsShipmentEngine.js` — `canTransitionShipmentStatus`, `VALID_TRANSITIONS`

**Audit:** Every transition inserts `shipment_status_events` row.

**API:** `transitionShipmentStatusWrite`

---

## Courier assignment (Phase 2)

| Rule | Detail |
|------|--------|
| **Directory** | `logistics_couriers` per tenant |
| **Assignment** | On transition to `assigned` — courier fields on shipment |
| **API** | Courier CRUD in `logisticsSupabaseApi.js` |
| **Validation** | `logisticsCourierEngine.js` |

---

## Delivery methods (operational)

Tracked on shipment / dispatch UI:
- `primecare_delivery`
- `courier`
- `customer_pickup`
- `vendor_direct`
- `distributor_delivery`

**Customer pickup:** Triggers delivery charge reconciliation to ₹0 (unless HQ override).

---

## Delivered today rule

- KPI **"delivered today"** uses `order_shipments.delivered_at` timestamp
- **Not** `orders.fulfilled_at` and not `orders.status`
- Set on transition to `delivered` status

---

## Delivery charge policy (Phase 3A — operational only)

See [09_delivery_charge_policy.md](./09_delivery_charge_policy.md) for full priority stack.

| Rule | Detail |
|------|--------|
| **Storage** | `tenant_delivery_policy` per tenant |
| **Order snapshot** | `orders.delivery_charge_*` fields at create/override |
| **Shipment mirror** | `order_shipments.delivery_charge_amount/reason` |
| **Not in invoice** | Invoice RPC untouched by delivery charge code |
| **Not in AR** | `orders.total_amount` = merchandise only |
| **Feature flag** | `LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED=false` (Phase 3B) |

### Quote vs finance billing
| Phase | Behavior |
|-------|----------|
| **3A (current)** | Quote displayed in Lab cart, persisted operationally, mirrored to shipment |
| **3B (future)** | Synthetic line item, invoice integration, AR alignment — **requires approval** |

---

## HQ delivery override

- `applyOrderDeliveryOverrideWrite` — HQ can override quoted charge before invoice sent
- Blocked when invoice is customer-facing (sent/partially_paid/paid/cancelled or has PDF)
- Syncs to shipment via `syncShipmentDeliveryMirrorWrite`

---

## Reconciliation on dispatch

- `reconcileDeliveryChargeForShipmentWrite` — re-quotes when delivery method changes (e.g. pickup)
- Skipped when HQ override already set

---

## RLS summary

| Role | order_shipments |
|------|-----------------|
| admin/executive | Full ops CRUD for tenant |
| agent | SELECT assigned shipments only |
| lab | No direct shipment board access |

---

## Module boundaries (do not cross)

| Module | Must NOT reference |
|--------|-------------------|
| `invoiceSupabaseApi.js` | `order_shipments` |
| `CollectionsPage.jsx` | shipment tables |
| Payment allocation | delivery charge fields |
| Commission engine | logistics tables |

Verified by `verify-logistics-dispatch-flow.mjs` and `verify-delivery-charge-policy.mjs`.

---

## Known environment gap

Phase 3A migration (`20260701120000_logistics_phase3a_delivery_charges.sql`) must be applied for shipment insert with `delivery_charge_amount` columns. If code deployed before migration, shipment create fails with PostgREST `PGRST204` (non-blocking).

---

## Verification scripts

- `verify-logistics-dispatch-flow.mjs` — tables, hook order, state machine, finance isolation
- `verify-delivery-charge-policy.mjs` — policy engine, merchandise-only total_amount, no invoice coupling

---

## Manual UAT (logistics)

1. Fulfill order → shipment appears in Logistics board (`ready_for_dispatch`)
2. Assign courier → status `assigned`
3. Progress to `out_for_delivery` → `delivered` — `delivered_at` set
4. Confirm invoice/AR unchanged by delivery charge fields
5. Customer pickup path → delivery charge ₹0 on order/shipment (no HQ override)
6. HQ override before invoice sent → reflected on shipment
