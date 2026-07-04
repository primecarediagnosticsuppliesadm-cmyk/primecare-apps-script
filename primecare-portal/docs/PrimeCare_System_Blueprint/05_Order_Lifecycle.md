# 05 — Order Lifecycle

**Orders are the financial source of truth.** Shipment status does not replace order status.

---

## Status machine

```
Placed → Processing → Fulfilled
   └──────────────→ Cancelled
```

| Status | Meaning |
|--------|---------|
| **Placed** | Submitted; no inventory/AR finalize |
| **Processing** | HQ pipeline; no finance finalize |
| **Fulfilled** | Inventory + AR + invoice + shipment hooks |
| **Cancelled** | Terminal; cannot fulfill later |

**Forbidden:** Cancelled → Fulfilled.

---

## Order initiation

**Ordering Mode** (`labs.ordering_mode`) controls **who may initiate** a new order. It does **not** affect fulfillment, invoices, payments, collections, inventory, or shipment lifecycle.

| Mode | Who may initiate |
|------|------------------|
| **HQ Managed** | Admin / executive on behalf of an `ACTIVE` lab only |
| **Hybrid** | Lab + admin / executive on behalf of an `ACTIVE` lab |
| **Self Service** | Lab + admin / executive on behalf of an `ACTIVE` lab |
| **Suspended** | No new order initiation |

**Admin on-behalf ordering:** HQ `admin` / `executive` users may create orders on behalf of `ACTIVE` labs when `ordering_mode` is `hq_managed`, `hybrid`, or `self_service`. This is blocked when `labs.status = INACTIVE` or `ordering_mode = suspended`.

Admin-on-behalf orders must reuse the existing `LabOrderingPage`/cart path in explicit `adminOnBehalf` mode, preserve the selected lab as the customer, preserve the authenticated HQ user as the actor, and record `source = admin_on_behalf` in order/audit metadata. The flow must not impersonate a lab user.

Enforcement: `lab_ordering_allows_lab_initiate()` in `create_lab_order` RPC + `orders_insert_by_role` RLS for lab callers.

---

## Creation paths

| Path | API | Default status |
|------|-----|----------------|
| Lab checkout | `createOrderWrite` / `create_lab_order` RPC | Placed |
| HQ create | `createOrderWrite` | configurable |

### Preconditions
- Ordering mode gate (lab callers only)
- Admin-on-behalf eligibility: customer lab must be `ACTIVE`; `ordering_mode` must be `hq_managed`, `hybrid`, or `self_service`
- Credit hold check (`assertLabOrderCreditEligible`)
- Stock validation (no backorder pilot)
- `client_request_id` idempotency on lab checkout

### Side effects at create (Placed)
- Order row + lines (`order_items` and/or `order_lines`)
- Phase 3A delivery snapshot on order
- **No** AR bump, invoice, or shipment
- **No** compensation/payroll entry; payroll commission derives only from cash collected after successful payment posting

---

## Fulfillment path

**Trigger:** `updateOrderStatusWrite` → Fulfilled, or `createOrderWrite` with Fulfilled.

| Step | Action | Idempotent flag |
|------|--------|-----------------|
| 1 | Inventory deduction ORDER_OUT | `inventory_updated` |
| 2 | AR outstanding bump | `ar_posted` |
| 3 | Set `fulfilled_at` | — |
| 4 | Invoice RPC | RPC idempotent |
| 5 | Shipment create | unique (tenant, order_id) |

**Failure policy:** Invoice/shipment failures **do not roll back** fulfill.

---

## Cancellation

- Sets `cancelled_at`, status Cancelled
- No inventory deduction (except documented seeds)
- Tracking UI: "Payment Pending — Order Cancelled" when applicable

---

## order_id rules

- Business key for all joins and lab Track Order
- See `03_Field_Dictionary.md`

---

## APIs

| Operation | Function |
|-----------|----------|
| Create | `createOrderWrite` |
| Status | `updateOrderStatusWrite` |
| Read list | `getOrdersRead`, `getLabRecentOrdersRead` |
| Read detail | `getOrderDetailsRead`, `getLabOrderDetailsRead` |
| RPC | `create_lab_order`, `deduct_inventory_for_order` |

---

## Verification

- `verify-orders-admin-flow.mjs`
- `verify-transaction-integrity-rpcs.mjs`
- `verify-lab-ordering-flow.mjs`
- Compensation/payroll changes must additionally prove no order lifecycle mutation and no commission from order value.

---

## Related

- Finance: [06_Finance_Rules.md](./06_Finance_Rules.md)
- Logistics: [07_Logistics_Rules.md](./07_Logistics_Rules.md)
- Inventory: [11_Inventory_Rules.md](./11_Inventory_Rules.md)
- Compensation / payroll: [19_Executive_Compensation_Payroll_Engine.md](./19_Executive_Compensation_Payroll_Engine.md)
