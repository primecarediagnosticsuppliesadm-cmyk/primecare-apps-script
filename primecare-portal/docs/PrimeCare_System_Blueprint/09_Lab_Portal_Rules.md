# 09 — Lab Portal Rules

---

## Access model

| Rule | Detail |
|------|--------|
| **Not Day-1 default** | Lab portal enabled per lab via user provisioning |
| **Default ordering mode** | **HQ Managed** — HQ places/fulfills until onboarding completes |
| **Self-Service** | Lab checkout via `LabOrderingPage` when provisioned + credit OK |
| **Hybrid** | Mix of HQ and lab-initiated orders (operational policy) |
| **Menu** | labOrders → labInvoices → labAccount |

*Note: ordering mode is provisioning/onboarding policy today — no single DB enum yet (see CHANGELOG).*

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
| OK | Allowed |

---

## Checkout

- `createOrderWrite` / `create_lab_order` RPC
- Status default: **Placed**
- Idempotency: `clientRequestId` + cart hash guard
- Delivery quote displayed; snapshot on server

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
- `src/utils/orderTracking.js`
- `src/api/primecareSupabaseApi.js` — `getLabOrderDetailsRead`
