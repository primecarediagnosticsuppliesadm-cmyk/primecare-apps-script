# 07 — Logistics Rules

**Shipments are the operational source of truth for dispatch.** Orders remain financial SoT.

**Phase 4 route planning is operational only** — no finance, invoice, payment, AR, or collections changes.

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

## Operational lifecycle (dispatch + planning)

```
Shipment created (fulfill)
   ↓
Ready For Dispatch
   ↓
Delivery Planning          ← Phase 4: assign to route, sequence stops
   ↓
Assigned Route             ← route_status = assigned; driver/courier on route
   ↓
Assigned Driver            ← logistics_couriers / courier_id on route
   ↓
Out For Delivery           ← shipment dispatch_status + optional route_status
   ↓
Delivered
   ↓
Returned / Failed          ← terminal ops paths unchanged
```

Shipment `dispatch_status` machine (Phase 1A–2) remains canonical for individual shipment transitions. Route planning adds a **parallel planning layer** on `delivery_routes` + `delivery_route_shipments` without changing finance modules.

---

## Status lifecycle (shipment)

```
ready_for_dispatch → assigned → out_for_delivery
  → delivered | delivery_failed
delivery_failed → rescheduled | returned
```

Engine: `logisticsShipmentEngine.js`  
API: `transitionShipmentStatusWrite`  
Audit: `shipment_status_events`

---

## Route planning (Phase 4)

### Tables

| Table | Purpose |
|-------|---------|
| `logistics_warehouses` | Warehouse registry for route origin |
| `delivery_routes` | Planned route (day, vehicle, capacity, driver) |
| `delivery_route_shipments` | Stop sequence on a route |
| `labs.preferred_delivery_day` | Lab Mon–Sun preference for planning groups |

### HQ capabilities

| Action | API |
|--------|-----|
| Create route | `createDeliveryRouteWrite` |
| Assign shipment to route | `assignShipmentToRouteWrite` |
| Reorder stops | `reorderRouteStopsWrite` |
| Remove stop | `removeShipmentFromRouteWrite` |
| Assign driver | `updateDeliveryRouteWrite` (`courier_id`) |
| Mark route complete / failed | `completeDeliveryRouteWrite` |

**Not in Phase 4:** GPS, maps, stop optimization, driver mobile app, proof-of-delivery capture.

### Route planning KPIs

Computed in `logisticsRouteEngine.js` → `RoutePlanningPanel`:

- Routes Today
- Vehicles Out
- Average Stops
- Planned Deliveries
- Completed Routes
- Failed Routes

### Delivery days

Each lab may set `preferred_delivery_day` (`mon`–`sun`) in Operations Center lab profile. Planning dashboard groups unassigned shipments by preferred day.

---

## Couriers (Phase 2)

- Table: `logistics_couriers`
- Assigned on transition to `assigned` (shipment) or on route (Phase 4 driver assignment)
- No formal FK from shipment — text `courier_id`

---

## Delivered today KPI

Uses **`order_shipments.delivered_at`**, not `orders.fulfilled_at`.

---

## Module isolation

Finance modules (`invoiceSupabaseApi`, `CollectionsPage`) **must not** reference `order_shipments`, `delivery_routes`, or route planning tables.

---

## Future foundation (documented, not implemented)

| Capability | Status |
|------------|--------|
| GPS tracking | Future |
| Maps integration | Future |
| Driver mobile app | Future |
| Proof of delivery | Future |
| Vehicle live tracking | Future |
| Distance-based optimization | Future |

---

## Environment gap

Phase 3A migration adds `delivery_charge_amount` to shipments. Phase 4 adds route tables + `labs.preferred_delivery_day`. If migration missing on env, route UI degrades gracefully. See CHANGELOG.

---

## Verification

- `verify-logistics-dispatch-flow.mjs`

---

## Related

- Delivery charges: [08_Delivery_Charge_Rules.md](./08_Delivery_Charge_Rules.md)
- Orders: [05_Order_Lifecycle.md](./05_Order_Lifecycle.md)
