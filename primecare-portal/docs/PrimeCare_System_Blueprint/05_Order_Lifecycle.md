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

## Creation paths

| Path | API | Default status |
|------|-----|----------------|
| Lab checkout | `createOrderWrite` / `create_lab_order` RPC | Placed |
| HQ create | `createOrderWrite` | configurable |

### Preconditions
- Credit hold check (`assertLabOrderCreditEligible`)
- Stock validation (no backorder pilot)
- `client_request_id` idempotency on lab checkout

### Side effects at create (Placed)
- Order row + lines (`order_items` and/or `order_lines`)
- Phase 3A delivery snapshot on order
- **No** AR bump, invoice, or shipment

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

---

## Related

- Finance: [06_Finance_Rules.md](./06_Finance_Rules.md)
- Logistics: [07_Logistics_Rules.md](./07_Logistics_Rules.md)
- Inventory: [11_Inventory_Rules.md](./11_Inventory_Rules.md)
