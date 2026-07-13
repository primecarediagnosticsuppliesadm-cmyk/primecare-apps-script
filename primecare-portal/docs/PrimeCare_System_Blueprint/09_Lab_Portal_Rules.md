# 09 — Lab Portal Rules

---

## Access model

| Rule | Detail |
|------|--------|
| **Not Day-1 default** | Lab portal enabled per lab via user provisioning |
| **Default ordering mode** | **HQ Managed** (`labs.ordering_mode = hq_managed`) until onboarding enables self-service |
| **Ordering governance** | `ordering_mode` on `labs` controls **who may initiate** an order — not finance, inventory, or shipment lifecycle |
| **Menu** | labOrders → labInvoices → labAccount |

---

## Lab onboarding lifecycle (commercial)

Ordering capability follows onboarding progress. Stages are operational labels; **`ordering_mode`** is the runtime gate.

```
Prospect
   ↓
Qualified
   ↓
Contract Signed
   ↓
HQ Managed          ← default Year-1; HQ places orders
   ↓
Hybrid              ← lab + HQ may initiate
   ↓
Self Service        ← lab self-checkout enabled
   ↓
Suspended           ← lab checkout blocked; HQ on-behalf ordering blocked
```

| Stage / mode | Lab create order | Admin / executive on-behalf order | Track / invoices / payments |
|--------------|------------------|-----------------------------------|-----------------------------|
| **HQ Managed** | ✖ | ✔ when `labs.status = ACTIVE` | ✔ always |
| **Hybrid** | ✔ | ✔ when `labs.status = ACTIVE` | ✔ always |
| **Self Service** | ✔ | ✔ when `labs.status = ACTIVE` | ✔ always |
| **Suspended** | ✖ | ✖ | ✔ always |

**Admin on-behalf ordering:** HQ (`admin` / `executive`) may create orders on behalf of an `ACTIVE` lab when `ordering_mode` is `hq_managed`, `hybrid`, or `self_service`. On-behalf order creation is blocked when `labs.status = INACTIVE` or `ordering_mode = suspended`.

Admin on-behalf ordering must reuse the existing `LabOrderingPage` catalog/cart/checkout flow in an explicit `adminOnBehalf` mode. It must not duplicate the ordering UI and must not impersonate a lab user. The selected lab remains the order customer, while the authenticated HQ user remains the actor. Order/audit metadata must identify `source = admin_on_behalf`, the originating screen, selected customer lab, authenticated HQ actor, lifecycle status, and ordering mode at submit time.

Existing pricing, catalog, credit, inventory, finance, delivery, AR, shipment, and commission behavior must remain unchanged for admin-on-behalf orders.

---

## `ordering_mode` values

| DB value | UI label |
|----------|----------|
| `hq_managed` | HQ Managed |
| `hybrid` | Hybrid |
| `self_service` | Self Service |
| `suspended` | Suspended |

Default for new and existing labs (migration backfill): `hq_managed`.

---

## Lab lifecycle status

Lifecycle status is owned by `labs.status`. Ordering Mode remains a separate operational concept. Lifecycle state is not a financial state, and it must never alter or hide Finance, AR, Orders, Shipments, Payments, or Audit History source-of-truth domains.

| Status | Meaning | Ordering behavior | History / financial visibility |
|--------|---------|-------------------|--------------------------------|
| `PROSPECT` | Commercial/onboarding lab record that is not yet lifecycle-active | Uses `ordering_mode`; generally HQ Managed until activation | Visible to authorized HQ users |
| `ACTIVE` | Lifecycle-active laboratory | Uses `ordering_mode` and credit eligibility to determine order initiation | All invoices, payments, Track Order, shipment history, audit, and reporting remain available |
| `INACTIVE` | Retained but inactive laboratory account | Lab checkout/reorder blocked because status transition forces `ordering_mode = suspended` | Must remain visible for AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting, and authorized HQ views |

### Allowed transitions

| Transition | Authorized roles | Confirmation | Reason | Side effects |
|------------|------------------|--------------|--------|--------------|
| `PROSPECT` -> `ACTIVE` | `admin`, `executive` | Required | Recommended | Sets lifecycle state only |
| `PROSPECT` -> `INACTIVE` | `admin`, `executive` | Required | Required | Sets lifecycle state and `ordering_mode = suspended` |
| `ACTIVE` -> `INACTIVE` | `admin`, `executive` | Required | Required | Must atomically set `ordering_mode = suspended` |
| `INACTIVE` -> `ACTIVE` | `admin`, `executive` | Required | Required | Sets lifecycle state only; does **not** restore previous `ordering_mode` |

`INACTIVE` -> `ACTIVE` requires a separate administrator decision before order initiation is restored. Admin must explicitly choose `hq_managed`, `hybrid`, or `self_service` after reactivation if ordering should resume.

### INACTIVE invariant

Changing a lab to `INACTIVE` must never:

- Delete, hide, or mutate AR, invoices, payments, payment allocations, orders, shipments, Track Order data, audit history, reporting history, or authorized HQ visibility.
- Modify invoice status, payment allocation, order lifecycle, shipment lifecycle, commission logic, inventory, or financial reconciliation.
- Weaken tenant isolation, lab scoping, or RLS visibility for authorized users.

---

## Labs KPI definitions

Ordering mode and lifecycle status are separate dimensions.

| KPI | Definition | Meaning |
|-----|------------|---------|
| **Total Labs** | Count of all labs visible to the current authorized scope | Complete lab portfolio regardless of lifecycle status or ordering mode. |
| **Prospect Labs** | `labs.status == PROSPECT` | Onboarding/commercial prospects that are not lifecycle-active. |
| **Active Labs** | `labs.status == ACTIVE` | Lifecycle-active laboratories. Unaffected by `ordering_mode`. |
| **Inactive Labs** | `labs.status == INACTIVE` | Inactive retained labs. Financial and operational history remains visible. |
| **Order-Eligible Labs** | `labs.status == ACTIVE` AND `ordering_mode != suspended` AND `ordering_eligible == true` | Laboratories currently allowed to initiate new orders. |
| **Ordering Suspended** | `ordering_mode == suspended` | Laboratories whose checkout is intentionally suspended. Invoices, payments, Track Order, finance, logistics, and history remain available. |

`Prospect Labs`, `Active Labs`, and `Inactive Labs` are mutually exclusive lifecycle counts. `Order-Eligible Labs` and `Ordering Suspended` are operational posture counts and must not be used to silently redefine lifecycle status.

---

## Data scope

Lab sees **only own** `lab_id` data — RLS + `scopedRecentOrders` filter.

**Blocked:** HQ logistics, operations admin, other labs, founder modules.

---

## Credit control

| Status | Checkout |
|--------|----------|
| HOLD | Blocked (UI + server) |
| NEAR_LIMIT | Warning only |
| OK | Allowed when `ordering_mode` permits lab initiation |

Credit hold is independent of ordering mode.

---

## Checkout

- `createOrderWrite` / `create_lab_order` RPC
- Server gate: `lab_ordering_allows_lab_initiate` + `orders_insert_by_role` when caller is `lab`
- Admin-on-behalf checkout must call the same order creation path without impersonation and must persist/audit `source = admin_on_behalf`
- **Persistence confirmation:** `createOrderWrite` must read back `orders` + lines before success UI (`confirmLabOrderPersistedReadWithRetry` — up to 3 attempts)
- RPC `create_lab_order` must return an `order` row; success without order data is treated as failure (no false-success banner)
- Success banner uses **confirmed DB row** (order_id, total_amount, line count) — not cart-only or client-generated values
- If confirmation fails: cart stays, error *"Order could not be confirmed. Your cart is saved…"*, no success banner
- Track Order during in-flight checkout shows *"Confirming your order…"* — not "Order not found"
- Structured checkout diagnostics (order_id, tenant_id, lab_id, client_request_id, RPC result, line count, delivery snapshot, elapsed ms, build stamp) — no auth tokens
- Status default: **Placed**
- Idempotency: `clientRequestId` + cart hash guard
- Delivery quote displayed; snapshot persisted via **`persist_order_delivery_snapshot` RPC** only
- Lab **cannot** directly `UPDATE` `orders` (status, totals, or delivery fields)

### Lab UX by mode

| Mode | Catalog / cart |
|------|----------------|
| HQ Managed | No add-to-cart / checkout; onboarding message; track/invoices/payments/history remain |
| Hybrid | Normal ordering + assisted-mode banner |
| Self Service | Normal ordering |
| Suspended | Checkout hidden; suspension message; read paths unchanged |

### Lab UX when lifecycle status is INACTIVE

Inactive labs may log into the Lab Portal when provisioned, but checkout and reorder actions remain blocked because `ordering_mode` must be `suspended`. Catalog, invoices, payments, Track Order, previous orders, shipment history, and account history remain available as read paths.

---

## Track Order (critical)

| Rule | |
|------|--|
| Search by **`orders.order_id`** first | |
| Secondary: `orders.id` (uuid) | |
| API: `getLabOrderDetailsRead({ orderId, labId, tenantId })` | |
| Local cache: checkout snapshot + recent orders | |
| Apps Script fallback only if `ALLOW_LEGACY_APPS_SCRIPT` | |
| Error only after Supabase + cache fail | |
| **During checkout confirmation** | Show *"Confirming your order…"* — never *"Order not found"* until confirmation fails |
| **Post-checkout Track** | Must open the **confirmed** `order_id` only — ignore stale in-flight tracking responses |
| **Never blocked by `ordering_mode`** | |

---

## Previous Orders

- `getLabRecentOrdersRead` — limit 50
- After checkout: optimistic merge + refresh
- No hard refresh required

---

## Verification

- `verify-lab-ordering-flow.mjs`
- `verify-lab-lifecycle-status-flow.mjs`
- `verify-labs-admin-flow.mjs`
- `verify-labs-projection-parity.mjs`
- `verify-hq-rls-reads.mjs`

Admin on-behalf ordering UAT must cover: `hq_managed`, `hybrid`, and `self_service` `ACTIVE` labs can be ordered for by `admin` and `executive`; `INACTIVE` labs and `suspended` Ordering Mode are blocked; selected lab remains customer; authenticated HQ user remains actor; order/audit metadata includes `source = admin_on_behalf`; Track Order, invoices, payments, AR, inventory, delivery, shipment, commission, and pricing behavior remain unchanged.

---

## Key files

- `src/pages/LabOrderingPage.jsx`
- `src/labOrdering/orderingGovernance.js`
- `src/utils/orderTracking.js`
- `src/api/primecareSupabaseApi.js` — `createOrderWrite`, `getLabOrderDetailsRead`, `updateLabOrderingModeWrite`, `updateLabLifecycleStatusWrite`
- `src/components/operations/OperationalLabDrawer.jsx` — admin ordering mode, lifecycle editor, and admin-on-behalf order launch point
