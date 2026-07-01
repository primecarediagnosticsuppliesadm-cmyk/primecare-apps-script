# 07 — Lab Portal Rules

Rules for the Lab User role (`lab`) — ordering, tracking, invoices, and account.

---

## Access model

| Rule | Detail |
|------|--------|
| **Pilot login** | Lab role enabled on QA/PROD (`PILOT_LAUNCH_ROLES`) |
| **Default menu** | `labOrders` → `labInvoices` → `labAccount` |
| **Default landing** | `labOrders` (Lab Ordering page) |
| **Not Day-1 for all labs** | Lab portal access is provisioned per lab user — not automatic for every lab in master |
| **HQ Managed default** | New labs operate under HQ order placement until self-service is enabled via onboarding/provisioning policy |

### Ordering modes (business intent)

| Mode | Meaning |
|------|---------|
| **HQ Managed** | HQ places or fulfills orders on behalf of lab; lab portal may be read-only or limited initially |
| **Hybrid** | Mix of HQ and lab-initiated orders |
| **Self-Service** | Lab places own orders via portal (current `LabOrderingPage` checkout flow) |

Mode is an **operational/onboarding policy** — enforced by provisioning (lab user exists + credit eligible) rather than a single DB enum today. Future: explicit lab ordering mode flag in blueprint before implementation.

---

## Data scope

| Data | Scope |
|------|-------|
| Orders | Own `profiles.lab_id` only — RLS + client filter (`scopedRecentOrders`) |
| Invoices | Own lab via `getInvoicesForLabRead` |
| Payments / account | Own lab AR + invoice ledger |
| Catalog | Tenant catalog filtered to lab-visible products with stock |
| Logistics | **No access** — cannot view HQ dispatch board |
| Operations Center | **No access** |
| Collections (HQ) | **No access** — lab uses `labAccount` instead |

**Cross-lab leak prevention:** `labIdKey()` normalization on both profile and order rows; `fetchScopedOrderDetails` rejects foreign lab.

---

## Credit control

| Status | UI behavior | Server behavior |
|--------|-------------|-----------------|
| `HOLD` | Checkout disabled; banner shown | `createOrderWrite` / RPC rejects |
| `NEAR_LIMIT` | Warning banner | Checkout allowed |
| Normal | — | Credit check passes |

Source: `currentUser.creditStatus`, `ar_credit_control.credit_hold`

---

## Catalog & cart

| Rule | Detail |
|------|--------|
| **Primary read** | `getLabCatalogRead` (Supabase) |
| **Legacy fallback** | Apps Script only if `ALLOW_LEGACY_APPS_SCRIPT` |
| **Stock enforcement** | No backorder — `findCartStockViolations` blocks checkout |
| **Out of stock** | Products with `current_stock <= 0` blocked |
| **Cart persistence** | `localStorage` draft per lab key |
| **Duplicate submit** | Cart hash guard after successful checkout |

---

## Checkout flow

| Step | Behavior |
|------|----------|
| 1 | Validate credit, stock, non-empty cart |
| 2 | `createOrderWrite` with `clientRequestId` for idempotency |
| 3 | Default status `Placed` — fulfillment is HQ-side |
| 4 | Delivery quote snapshot persisted (Phase 3A) |
| 5 | Success banner shows **business `order_id`** |
| 6 | Cart cleared; recent orders refreshed with merge |
| 7 | Optional auto-open Track Order drawer |

**No duplicate order creation:** RPC idempotency via `client_request_id`; UI hash lock.

---

## Track Order rules

| Rule | Detail |
|------|--------|
| **Lookup key** | **`orders.order_id`** (business number) — primary |
| **Secondary** | `orders.id` (UUID) if needed |
| **Never** | Use UUID when user passed business order_id |
| **Fetch API** | `getLabOrderDetailsRead({ orderId, labId, tenantId })` |
| **Fallback chain** | Supabase lab-scoped → global `getOrderDetailsRead` → legacy Apps Script only if enabled |
| **Local cache** | Checkout snapshot + recent orders used for immediate drawer |
| **Error timing** | Show "Order not found" only after Supabase fetch fails (not from Apps Script alone) |
| **Drawer** | `OrderTrackingDrawer` via `openOrderTracking` |

---

## Previous Orders tab

| Rule | Detail |
|------|--------|
| **Source** | `getLabRecentOrdersRead(labId)` — last 50 |
| **After checkout** | Optimistic merge — new order prepended; `loadRecentOrders` preserves seed |
| **Sort** | Newest first by date |
| **No hard refresh** | Required after successful checkout |

---

## Invoices (lab)

- Page: `labInvoices` / Lab Invoice Center
- Read via `getInvoicesForLabRead`
- PDF download via `downloadInvoicePdf`
- Only customer-facing invoices shown in open-balance widgets (drafts hidden)

---

## Payments & account (lab)

- Page: `labAccount` (route alias from `/collections` for lab role)
- Outstanding from `getCollectionsRead` or `buildLabAccountLedger` fallback
- Payment history scoped to lab

---

## Delivery charge display (Phase 3A)

- Cart shows estimated delivery from `buildDeliveryQuoteForLabOrder`
- Display only — not added to `orders.total_amount`
- Actual snapshot on server at order create

---

## Notifications

- Lab may receive in-app notifications (permission exists; hidden in pilot sidebar for some roles)
- Target: lab role for lab-scoped events

---

## Blocked actions (summary)

- Fulfill / cancel orders
- HQ logistics dispatch
- User provisioning
- Catalog/inventory edits
- Other labs' data
- Executive/founder modules

---

## Verification

- `verify-lab-ordering-flow.mjs` — track lookup, RPC smoke, legacy guard
- `verify-hq-rls-reads.mjs` — lab tenant isolation
- Manual: checkout → Track Order → Previous Orders without refresh

---

## Key files

| File | Purpose |
|------|---------|
| `src/pages/LabOrderingPage.jsx` | Main lab ordering UI |
| `src/utils/orderTracking.js` | Track fetch, labels, local resolve |
| `src/api/primecareSupabaseApi.js` | `createOrderWrite`, `getLabRecentOrdersRead`, `getLabOrderDetailsRead` |
| `src/api/deliveryChargeSupabaseApi.js` | Delivery quote at checkout |
