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
| Read list | `getOrdersRead` (default ≤100 recent), `getLabRecentOrdersRead` |
| Exact ID (HQ) | `lookupHqOrderByIdRead` — Admin/Executive session role; RLS tenant; no client `tenant_id` authorization |
| Read detail | `getOrderDetailsRead`, `getLabOrderDetailsRead` |
| RPC | `create_lab_order`, `deduct_inventory_for_order` |

### HQ Orders list vs exact ID search (Lab Ordering 1C)

- Default HQ Orders queue is a bounded recent list (`HQ_ORDERS_LIST_DEFAULT_LIMIT` = 100). Status, lab, date, and free-text filters apply to that window only.
- Exact business `order_id` search (`ORD-…`) performs a bounded server lookup so Admin/Executive can open a same-tenant order outside the recent window.
- Authorization: authenticated `profiles.role` must be `admin` or `executive`; tenant isolation is RLS plus session profile tenant. Do not trust client-supplied `tenant_id`.
- Agent and Lab must not gain this HQ lookup. Lab tracking remains `getLabOrderDetailsRead`.

---

## HQ Status Actions — interaction feedback (Sprint 1A)

UX-only standard for Orders → Order Details **Status Actions** (Mark Processing, Mark Fulfilled, Cancel Order, Reset to Placed). Write path remains `updateOrderStatusWrite` — no lifecycle, inventory, finance, permission, or layout changes.

| Rule | Detail |
|------|--------|
| **Error mapper** | `mapOrderMutationError.js` — business-facing titles for known failures |
| **Error placement** | `ActionErrorSummary` inside Status Actions — never page-top for status mutations |
| **Loading labels** | Marking Processing… / Fulfilling Order… / Cancelling Order… / Resetting Order… |
| **Busy state** | Disable all status buttons while in flight; `aria-busy` on active action; duplicate-submit guard |
| **Success** | Toast; patch affected order in list + refresh detail; preserve selection, filters, search, scroll |
| **Note field** | Optional status note retained on failure |

### Mapped error families

- Order already fulfilled / cannot fulfill from current status
- Order cannot be cancelled
- Order no longer exists
- Inventory unavailable
- Permission denied
- Status write frozen / service unavailable
- Unexpected write failure

---

## HQ Orders context & continuity (Sprint 1B)

UX-only orientation and return-path improvements. No route, lifecycle, SoT, or write-path changes. Sprint 1A Status Actions feedback remains the mutation error surface.

| Rule | Detail |
|------|--------|
| **Start Here** | Labels existing **Awaiting fulfillment** queue as the operational starting point; **Review Next Order** opens the first queue order — no new prioritization math |
| **Context strip** | Compact `OrdersContextStrip` — Viewing: queue · order ID · lab · search · freeze |
| **Selected order** | Explicit row/card selected state + `aria-selected`; order ID in detail header; retained after targeted refresh |
| **Outside filters** | If selected/focused order is hidden by filters, show recovery — Clear Filters / Return to Queue (never auto-clear silently; never silently select a different order) |
| **Return context** | `primecare_orders_return_context` stores source=Orders, orderId, labId, queue/filters/search before Collections / Labs / Logistics navigation |
| **Back to Orders** | Destinations show CTA; restore applies only when Back arms `pendingRestore` |
| **Empty states** | Differentiated: no orders / search / filters / queue / focus outside / read failed — each with a recovery action |
| **Error classes** | Page read → `DataFetchError`; status mutation → Sprint 1A `ActionErrorSummary`; restore/context → compact strip warning |

---

## HQ Orders workspace simplification (Sprint 1C)

Presentation-only page budget. **Does not** split Orders into persona workspaces. Queue math, routing, and write paths unchanged.

| Rule | Detail |
|------|--------|
| **Primary question** | Header answers: *What order work needs my attention?* |
| **Page budget** | Header → Context strip → Start Here → Search/filters + Order queue → Selected order → Expandable secondary |
| **Collapsed** | Order portfolio KPI summary; order metadata (contact/phone); activity/notes |
| **Operational-first detail** | Selected order + expected action + Status Actions expanded; invoice/payment/logistics/items remain available |
| **No stacked dashboards** | Empty-detail mini KPI grid removed; portfolio KPIs not in first viewport |
| **Sprint 1A–1B** | Mutation errors stay in Status Actions; context strip + Start Here + return path retained |

---

## Verification

- `verify-orders-admin-flow.mjs`
- `verify-orders-action-feedback.mjs` (Sprint 1A UX gate)
- `verify-orders-navigation-context.mjs` (Sprint 1B UX gate)
- `verify-orders-workspace-simplification.mjs` (Sprint 1C UX gate)
- `verify-transaction-integrity-rpcs.mjs`
- `verify-lab-ordering-flow.mjs`
- Compensation/payroll changes must additionally prove no order lifecycle mutation and no commission from order value.

---

## Related

- Finance: [06_Finance_Rules.md](./06_Finance_Rules.md)
- Logistics: [07_Logistics_Rules.md](./07_Logistics_Rules.md)
- Inventory: [11_Inventory_Rules.md](./11_Inventory_Rules.md)
- Compensation / payroll: [19_Executive_Compensation_Payroll_Engine.md](./19_Executive_Compensation_Payroll_Engine.md)
