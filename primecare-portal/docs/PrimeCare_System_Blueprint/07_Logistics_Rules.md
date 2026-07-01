# 07 — Logistics Rules

**Shipments are the operational source of truth for dispatch.** Orders remain financial SoT.

---

## Shipment creation

| Rule | Detail |
|------|--------|
| When | After order `Fulfilled` |
| Order vs invoice hook | **After** `createInvoiceForFulfilledOrderWrite` |
| API | `tryCreateShipmentAfterFulfill` → `createShipmentForFulfilledOrderWrite` |
| Idempotency | UNIQUE `(tenant_id, order_id)` |
| ID | `SHP-{order_id}` |
| Initial status | `ready_for_dispatch` |
| On failure | Log only — fulfill not rolled back |

---

## Status lifecycle

```
ready_for_dispatch → assigned → out_for_delivery
  → delivered | delivery_failed
delivery_failed → rescheduled | returned
```

Engine: `logisticsShipmentEngine.js`  
API: `transitionShipmentStatusWrite`  
Audit: `shipment_status_events`

---

## Couriers (Phase 2)

- Table: `logistics_couriers`
- Assigned on transition to `assigned`
- No formal FK from shipment — text `courier_id`

---

## Delivered today KPI

Uses **`order_shipments.delivered_at`**, not `orders.fulfilled_at`.

---

## Module isolation

Finance modules (`invoiceSupabaseApi`, `CollectionsPage`) **must not** reference `order_shipments`.

---

## Environment gap

Phase 3A migration adds `delivery_charge_amount` to shipments. If migration missing on env, insert fails `PGRST204` (non-blocking). See CHANGELOG.

---

## Verification

- `verify-logistics-dispatch-flow.mjs`

---

## Related

- Delivery charges: [08_Delivery_Charge_Rules.md](./08_Delivery_Charge_Rules.md)
- Orders: [05_Order_Lifecycle.md](./05_Order_Lifecycle.md)
