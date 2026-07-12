# Sprint 1A — HQ Order Action Feedback (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Orders → Order Details status actions |
| Date | 2026-07-11 |
| Gate | **ALLOWED** (UI/UX only) |
| Baseline | Orders Certification Baseline |

## Scope

Improve interaction feedback for existing HQ order status actions. No schema, API, RPC, lifecycle, inventory, finance, permission, or layout changes.

### In scope

- Mark Processing
- Mark Fulfilled
- Cancel Order
- Reset to Placed

### Out of scope

- Checkout, Lab Ordering, Inventory pages
- Workspace split, routing, Orders page redesign
- Write path / business rule changes

---

## 1. Feature Inventory

| Current action | Current UI | Write handler | Permission | Business rule | Parity after redesign |
|----------------|------------|---------------|------------|----------------|------------------------|
| Mark Processing | Status Actions button; generic “Updating…” on Processing only | `updateOrderStatusWrite` → `Processing` (Apps Script fallback when allowed) | HQ Orders page roles; `hqStatusWriteBlocked` freeze | Processing: no finance/inventory finalize | **Same** write + rules; clearer loading + inline errors |
| Mark Fulfilled | Status Actions button; no per-action loading label | `updateOrderStatusWrite` → `Fulfilled` | Same | Inventory ORDER_OUT + AR bump + invoice/shipment hooks | **Same** |
| Cancel Order | Status Actions destructive outline | `updateOrderStatusWrite` → `Cancelled` | Same | Terminal; sets `cancelled_at` | **Same** |
| Reset to Placed | Status Actions button | `updateOrderStatusWrite` → `Placed` | Same | Status reset; no invent/AR undo in this path | **Same** |

| Feedback today | After Sprint 1A |
|----------------|-----------------|
| Failures → page-top `DataFetchError` / `setError` | Failures → `ActionErrorSummary` in Status Actions |
| Success → page-top emerald banner | Success → toast |
| Full silent `loadOrders` after mutate | Patch affected order row + refresh detail; preserve filters/search/selection |
| Duplicate clicks partially blocked by `updatingStatus` | Explicit in-flight ref + `aria-busy` + disable all action buttons |

---

## 2. Files affected

| File | Change |
|------|--------|
| `src/orders/mapOrderMutationError.js` | **Create** — business-friendly error mapping |
| `src/orders/ordersActionUi.js` | **Create** — loading labels helper |
| `src/pages/OrdersPage.jsx` | Wire mapper, inline errors, toast, busy labels, duplicate guard |
| `scripts/verify-orders-action-feedback.mjs` | **Create** — Sprint 1A gate |
| `docs/PrimeCare_System_Blueprint/05_Order_Lifecycle.md` | Document UX action feedback |
| `docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md` | Register verify script |
| `docs/PrimeCare_System_Blueprint/CHANGELOG.md` | Sprint entry |
| `docs/QA/modules/orders/*` | Pre-impl, parity, UAT |

**Not touched:** `primecareSupabaseApi.js` write body, RPCs, schema, RLS, LabOrdering, checkout.

---

## 3. Functional Parity Report (planned)

See `Sprint1A_Functional_Parity_Report.md` (filled after implementation).

Confirm targets:

- No feature removal
- No permission changes
- No lifecycle changes
- No finance changes

---

## 4. Verification Plan

| Script | Purpose |
|--------|---------|
| `verify-orders-action-feedback.mjs` | Sprint 1A UX gate |
| `npm run build` | Compile |
| `verify-orders-admin-flow.mjs` | Orders KPI / fulfill / freeze regression |
| `verify-order-payment-sync.mjs` | Payment drawer / freeze guards |
| `verify-transaction-integrity-rpcs.mjs` | Order/payment RPC symbols |
| `verify-no-finance-mutation.mjs` | No finance surface mutation from this sprint |

---

## 5. Manual UAT

See `Sprint1A_UAT_Checklist.md`.

---

## Impact analysis (Architect)

| Area | Impact |
|------|--------|
| Modules | Orders (HQ details status actions only) |
| Tables | None |
| APIs | None (reuse `updateOrderStatusWrite`) |
| Roles | Unchanged (executive/admin Orders access) |
| Business rules | Unchanged |
| RLS/security | None |
| Performance | Slightly better — avoid full list reload on status success |
| Implementation gate | **ALLOWED** |
