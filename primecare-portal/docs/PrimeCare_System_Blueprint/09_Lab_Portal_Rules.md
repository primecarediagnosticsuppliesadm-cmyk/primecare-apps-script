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
Suspended           ← lab checkout blocked; admin override allowed
```

| Stage / mode | Lab create order | Admin create order | Track / invoices / payments |
|--------------|------------------|--------------------|-----------------------------|
| **HQ Managed** | ✖ | ✔ | ✔ always |
| **Hybrid** | ✔ | ✔ | ✔ always |
| **Self Service** | ✔ | ✔ (on behalf) | ✔ always |
| **Suspended** | ✖ | ✔ | ✔ always |

**Admin override:** HQ (`admin` / `executive`) may always create orders regardless of `ordering_mode`.

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
| **Never blocked by `ordering_mode`** | |

---

## Previous Orders

- `getLabRecentOrdersRead` — limit 50
- After checkout: optimistic merge + refresh
- No hard refresh required

---

## Verification

- `verify-lab-ordering-flow.mjs`
- `verify-hq-rls-reads.mjs`

---

## Key files

- `src/pages/LabOrderingPage.jsx`
- `src/labOrdering/orderingGovernance.js`
- `src/utils/orderTracking.js`
- `src/api/primecareSupabaseApi.js` — `getLabOrderDetailsRead`, `updateLabOrderingModeWrite`
- `src/components/operations/OperationalLabDrawer.jsx` — admin ordering mode editor
